/**
 * Motor de regras para Eventos Externos.
 *
 * Recebe um evento já persistido (com leadId resolvido) e a lista de
 * regras aplicáveis, e executa as ações:
 *
 *   moveToStep | setTemperature | addTag | sendMessage(free|fixed|template)
 *   pauseAi | resumeAi | handoff | notifyOwner
 *
 * Mensagens com `delayMinutes > 0` são agendadas como `followup_jobs`-like
 * via tabela auxiliar — neste momento, agendamos com `setTimeout` no
 * processo (mesmo padrão que o debounce); para sobreviver a restart usa-se
 * a ressincronização do followup engine. Por enquanto o uso comum é envio
 * imediato (delay = 0) e, quando há delay, ele é tratado como
 * "schedule via followup_jobs com texto fixo".
 */
import { and, eq } from "drizzle-orm";
import {
  externalEventRules,
  conversations as conversationsTable,
  leads as leadsTable,
} from "../../drizzle/schema";
import {
  getDb,
  getAgentById,
  findOrCreateConversation,
  updateConversation,
  updateLead,
  appendMessage,
  recordMetric,
} from "../db";
import { dispatchActions } from "../whatsapp/dispatcher";
import { notifyOwner } from "../_core/notification";
import { invokeLLM } from "../_core/llm";
import { sendTemplate, type WaCredentials } from "../whatsapp/client";
import {
  getWhatsappConfig,
  getTemplateById,
} from "../db";

export type RuleAction =
  | { kind: "moveToStep"; stepId: number }
  | { kind: "setTemperature"; temperature: "hot" | "warm" | "cold" }
  | { kind: "addTag"; tag: string }
  | {
      kind: "sendMessage";
      mode: "free" | "fixed" | "template";
      text?: string;
      templateName?: string;
      prompt?: string;
      delayMinutes?: number;
    }
  | { kind: "pauseAi" }
  | { kind: "resumeAi" }
  | { kind: "handoff" }
  | { kind: "notifyOwner"; title?: string };

export type AppliedAction = {
  kind: string;
  ok: boolean;
  detail?: string;
  error?: string;
};

/** Carrega as regras ativas para (agentId, eventType, sourceId). */
export async function loadRulesFor(
  agentId: number,
  eventType: string,
  sourceId: number
): Promise<Array<typeof externalEventRules.$inferSelect>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(externalEventRules)
    .where(
      and(
        eq(externalEventRules.agentId, agentId),
        eq(externalEventRules.eventType, eventType),
        eq(externalEventRules.enabled, true)
      )
    );
  // sourceId nulo = aplica a todas as fontes; senão precisa bater.
  // Também respeita o toggle visual `isActive` do editor v2 (default true).
  return rows
    .filter((r) => r.sourceId == null || r.sourceId === sourceId)
    .filter((r) => r.isActive !== false)
    .sort((a, b) => a.priority - b.priority);
}

function appendTagCsv(existing: string | null | undefined, tag: string): string {
  const set = new Set(
    String(existing ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
  );
  set.add(tag.trim());
  return Array.from(set).join(",");
}

/**
 * Renderiza variáveis simples no texto: {{name}}, {{phone}}, {{email}},
 * {{payload.x.y}} (caminho dentro do payload).
 */
export function renderTemplate(
  text: string,
  ctx: { name?: string | null; phone?: string | null; email?: string | null; payload?: any }
): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => {
    const k = String(key).trim();
    if (k === "name") return ctx.name ?? "";
    if (k === "phone") return ctx.phone ?? "";
    if (k === "email") return ctx.email ?? "";
    if (k.startsWith("payload.")) {
      const path = k.slice("payload.".length).split(".");
      let cur: any = ctx.payload;
      for (const p of path) {
        if (cur == null) return "";
        cur = cur[p];
      }
      return cur == null ? "" : String(cur);
    }
    return "";
  });
}

async function generateFreeMessage(opts: {
  agentId: number;
  prompt: string;
  ctx: { name?: string | null; phone?: string | null; email?: string | null; payload: any };
  eventType: string;
}): Promise<string> {
  const agent = await getAgentById(opts.agentId);
  const persona = agent?.persona ?? "";
  const sys = `Você é o agente de WhatsApp ${agent?.name ?? ""}. ${persona}\n` +
    `Você está sendo acionado por um EVENTO EXTERNO do tipo "${opts.eventType}". ` +
    `Gere uma mensagem natural, curta (no máximo 2 parágrafos), no tom do agente, ` +
    `sem soar robótica. NUNCA invente informação que não esteja no payload.\n` +
    `Lead: nome="${opts.ctx.name ?? ""}", telefone="${opts.ctx.phone ?? ""}", email="${opts.ctx.email ?? ""}".`;
  const user = `Instrução do operador:\n${opts.prompt}\n\nDados do evento (payload JSON):\n${JSON.stringify(opts.ctx.payload).slice(0, 4000)}`;
  try {
    const resp = await invokeLLM({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    });
    const text = (resp as any)?.choices?.[0]?.message?.content;
    if (typeof text === "string" && text.trim()) return text.trim();
  } catch (e) {
    console.warn("[external.engine] free message generation failed:", (e as Error).message);
  }
  // Fallback se LLM falhar
  return opts.prompt;
}

/**
 * Executa as ações de UMA regra contra um lead.
 * Retorna lista de ações aplicadas com status individual.
 */
export async function executeRuleActions(opts: {
  agentId: number;
  leadId: number;
  eventType: string;
  rule: typeof externalEventRules.$inferSelect;
  payload: any;
}): Promise<AppliedAction[]> {
  const { agentId, leadId, eventType, rule, payload } = opts;
  const applied: AppliedAction[] = [];

  const agent = await getAgentById(agentId);
  if (!agent) {
    return [{ kind: "rule", ok: false, error: "agente não encontrado" }];
  }

  const db = await getDb();
  if (!db) {
    return [{ kind: "rule", ok: false, error: "DB indisponível" }];
  }

  // dados do lead
  const leadRows = await db.select().from(leadsTable).where(eq(leadsTable.id, leadId)).limit(1);
  const lead = leadRows[0];
  if (!lead) return [{ kind: "rule", ok: false, error: "lead não encontrado" }];

  const conversationId = await findOrCreateConversation(agentId, leadId);

  const ctx = {
    name: lead.name ?? null,
    phone: lead.phoneNumber ?? null,
    email: lead.email ?? null,
    payload,
  };

  // ─── Editor v2: campos diretos na regra ───
  // Quando a regra tem qualquer um dos novos campos preenchidos, executa-os
  // como uma ÚNICA execução (sem multi-actions). Mantemos `actions` JSON
  // apenas como caminho legado para regras antigas.
  const v2HasTemplate = rule.templateId != null && rule.channelAgentId != null;
  const v2HasMove = rule.moveToStepId != null;
  const v2HasTag = !!(rule.tagLabel && rule.tagLabel.trim());
  const v2HasContext = !!(rule.aiContext && rule.aiContext.trim());
  const usingV2 = v2HasTemplate || v2HasMove || v2HasTag || v2HasContext;

  if (usingV2) {
    const delayMin = Math.max(0, Number(rule.delayMinutes ?? 0));
    const v2Exec = async () => {
      // 1) tag (CSV append idempotente)
      if (v2HasTag) {
        try {
          const next = appendTagCsv(lead.tags, rule.tagLabel!);
          await updateLead(leadId, { tags: next });
          applied.push({ kind: "addTag", ok: true, detail: rule.tagLabel! });
        } catch (e) {
          applied.push({ kind: "addTag", ok: false, error: (e as Error).message });
        }
      }
      // 2) mover etapa
      if (v2HasMove) {
        try {
          await updateConversation(conversationId, { currentStepId: rule.moveToStepId! });
          applied.push({ kind: "moveToStep", ok: true, detail: `step=${rule.moveToStepId}` });
        } catch (e) {
          applied.push({ kind: "moveToStep", ok: false, error: (e as Error).message });
        }
      }
      // 3) contexto IA — anexa no summary da conversation com cabeçalho
      if (v2HasContext) {
        try {
          const stamp = new Date().toISOString();
          const block = `[evento ${eventType} ${stamp}] ${rule.aiContext!.trim()}`;
          await appendExternalContextToConversation(conversationId, block);
          applied.push({ kind: "aiContext", ok: true, detail: "contexto anexado" });
        } catch (e) {
          applied.push({ kind: "aiContext", ok: false, error: (e as Error).message });
        }
      }
      // 4) template Cloud API
      if (v2HasTemplate) {
        try {
          const r = await sendTemplateForRule({
            channelAgentId: rule.channelAgentId!,
            templateId: rule.templateId!,
            toPhone: lead.phoneNumber,
          });
          applied.push({
            kind: "sendTemplate",
            ok: r.ok,
            detail: r.detail,
            error: r.error,
          });
          if (r.ok && r.bodyText) {
            await appendMessageRow({
              conversationId,
              templateName: r.templateName ?? "",
              bodyText: r.bodyText,
              waMessageId: r.messageId,
            });
          }
        } catch (e) {
          applied.push({
            kind: "sendTemplate",
            ok: false,
            error: (e as Error).message,
          });
        }
      }
    };
    if (delayMin > 0) {
      const ms = Math.min(delayMin * 60_000, 24 * 3600_000);
      scheduleDelayedExec(v2Exec, ms);
      applied.push({
        kind: "v2.scheduled",
        ok: true,
        detail: `agendado em ${delayMin} min`,
      });
    } else {
      await v2Exec();
    }
    await recordMetric({
      agentId,
      eventType: "external_event_processed",
      metadata: { eventType, ruleId: rule.id, applied, mode: "v2" },
    });
    return applied;
  }

  const actions = Array.isArray(rule.actions) ? (rule.actions as RuleAction[]) : [];

  for (const a of actions) {
    try {
      switch (a.kind) {
        case "moveToStep": {
          if (!a.stepId || typeof a.stepId !== "number") {
            applied.push({ kind: a.kind, ok: false, error: "stepId inválido" });
            break;
          }
          await updateConversation(conversationId, { currentStepId: a.stepId });
          applied.push({ kind: a.kind, ok: true, detail: `step=${a.stepId}` });
          break;
        }
        case "setTemperature": {
          if (!["hot", "warm", "cold"].includes(a.temperature)) {
            applied.push({ kind: a.kind, ok: false, error: "temperature inválida" });
            break;
          }
          await updateLead(leadId, { temperature: a.temperature });
          applied.push({ kind: a.kind, ok: true, detail: a.temperature });
          break;
        }
        case "addTag": {
          if (!a.tag || typeof a.tag !== "string") {
            applied.push({ kind: a.kind, ok: false, error: "tag inválida" });
            break;
          }
          const next = appendTagCsv(lead.tags, a.tag);
          await updateLead(leadId, { tags: next });
          applied.push({ kind: a.kind, ok: true, detail: a.tag });
          break;
        }
        case "pauseAi": {
          await updateConversation(conversationId, { aiPaused: true });
          applied.push({ kind: a.kind, ok: true });
          break;
        }
        case "resumeAi": {
          await updateConversation(conversationId, { aiPaused: false });
          applied.push({ kind: a.kind, ok: true });
          break;
        }
        case "handoff": {
          await updateConversation(conversationId, { aiPaused: true });
          await notifyOwner({
            title: `[${agent.name}] Handoff via evento externo`,
            content: `Lead ${lead.name ?? lead.phoneNumber ?? lead.email ?? `#${lead.id}`} requer atendimento humano (evento ${eventType}).`,
          });
          applied.push({ kind: a.kind, ok: true });
          break;
        }
        case "notifyOwner": {
          const title = a.title ?? `[${agent.name}] Evento ${eventType}`;
          const content =
            `Lead ${lead.name ?? lead.phoneNumber ?? lead.email ?? `#${lead.id}`} ` +
            `disparou ${eventType}.\n\nPayload:\n${JSON.stringify(payload).slice(0, 800)}`;
          await notifyOwner({ title, content });
          applied.push({ kind: a.kind, ok: true });
          break;
        }
        case "sendMessage": {
          let text = "";
          if (a.mode === "fixed") {
            text = renderTemplate(a.text ?? "", ctx);
          } else if (a.mode === "free") {
            text = await generateFreeMessage({
              agentId,
              prompt: a.prompt ?? a.text ?? `Cumprimente o lead após o evento ${eventType}.`,
              ctx,
              eventType,
            });
          } else if (a.mode === "template") {
            // Template Meta: requer modo oficial. Por enquanto registramos como
            // pendente; envio real será implementado quando o usuário tiver
            // template aprovado configurado.
            applied.push({
              kind: a.kind,
              ok: false,
              error: "envio de template Meta ainda não disparado por evento externo",
            });
            break;
          }
          if (!text.trim()) {
            applied.push({ kind: a.kind, ok: false, error: "texto vazio" });
            break;
          }
          const delay = Math.max(0, Number(a.delayMinutes ?? 0));
          if (delay > 0) {
            // agenda via setTimeout no processo (até 24h de safety)
            const ms = Math.min(delay * 60_000, 24 * 3600_000);
            scheduleDelayedSend({ agent, conversationId, text, ms });
            applied.push({
              kind: a.kind,
              ok: true,
              detail: `agendado em ${delay} min`,
            });
          } else {
            await dispatchActions({
              agent,
              conversationId,
              actions: [{ type: "text", text }],
              sender: "ai",
            });
            applied.push({ kind: a.kind, ok: true, detail: text.slice(0, 60) });
          }
          break;
        }
        default: {
          applied.push({ kind: (a as any).kind ?? "unknown", ok: false, error: "ação desconhecida" });
        }
      }
    } catch (e) {
      applied.push({ kind: (a as any).kind, ok: false, error: (e as Error).message });
    }
  }

  await recordMetric({
    agentId,
    eventType: "external_event_processed",
    metadata: { eventType, ruleId: rule.id, applied },
  });

  return applied;
}

/** Agendamento simples in-memory (perdido em restart, mas simples). */
const pendingTimers = new Map<string, NodeJS.Timeout>();
function scheduleDelayedSend(opts: {
  agent: any;
  conversationId: number;
  text: string;
  ms: number;
}) {
  const key = `${opts.conversationId}:${Date.now()}:${Math.random()}`;
  const t = setTimeout(async () => {
    pendingTimers.delete(key);
    try {
      await dispatchActions({
        agent: opts.agent,
        conversationId: opts.conversationId,
        actions: [{ type: "text", text: opts.text }],
        sender: "ai",
      });
    } catch (e) {
      console.warn(
        "[external.engine] delayed send failed:",
        (e as Error).message,
        opts.conversationId
      );
    }
  }, opts.ms);
  pendingTimers.set(key, t);
}

/** Para cleanup em testes. */
export function _clearPendingTimers() {
  pendingTimers.forEach((t) => clearTimeout(t));
  pendingTimers.clear();
}

/**
 * Agenda execução genérica (qualquer função async) após `ms` ms.
 * Mesmo padrão de `scheduleDelayedSend` mas sem texto fixo.
 */
function scheduleDelayedExec(fn: () => Promise<void>, ms: number) {
  const key = `v2:${Date.now()}:${Math.random()}`;
  const t = setTimeout(async () => {
    pendingTimers.delete(key);
    try {
      await fn();
    } catch (e) {
      console.warn("[external.engine] delayed v2 exec failed:", (e as Error).message);
    }
  }, ms);
  pendingTimers.set(key, t);
}

/**
 * Anexa um bloco de contexto externo ao summary da conversation.
 * Mantém os últimos ~4kB para não estourar token limit.
 */
async function appendExternalContextToConversation(conversationId: number, block: string) {
  const db = await getDb();
  if (!db) return;
  const rows = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId))
    .limit(1);
  const conv = rows[0];
  const prev = (conv?.summary ?? "").trim();
  const merged = (prev ? prev + "\n" : "") + block;
  const trimmed = merged.length > 4000 ? merged.slice(-4000) : merged;
  await db
    .update(conversationsTable)
    .set({ summary: trimmed, summaryUpdatedAt: new Date() })
    .where(eq(conversationsTable.id, conversationId));
}

/**
 * Envia template Cloud API usando o canal/agente especificado.
 * Retorna detalhes para registrar no log de aplicações.
 */
async function sendTemplateForRule(opts: {
  channelAgentId: number;
  templateId: number;
  toPhone: string;
}): Promise<{
  ok: boolean;
  detail?: string;
  error?: string;
  bodyText?: string;
  templateName?: string;
  messageId?: string;
}> {
  const config = await getWhatsappConfig(opts.channelAgentId);
  const tpl = await getTemplateById(opts.templateId);
  if (!tpl) return { ok: false, error: "template não encontrado" };
  if (!config?.phoneNumberId || !config?.accessToken) {
    return { ok: false, error: "canal sem credenciais Cloud API" };
  }
  const creds: WaCredentials = {
    phoneNumberId: config.phoneNumberId,
    accessToken: config.accessToken,
    appSecret: config.appSecret,
  };
  const r = await sendTemplate(creds, opts.toPhone, tpl.name, tpl.languageCode, []);
  if (!r.ok) {
    return { ok: false, error: r.error || "falha envio template" };
  }
  return {
    ok: true,
    detail: tpl.name,
    bodyText: tpl.bodyText,
    templateName: tpl.name,
    messageId: r.messageId,
  };
}

/** Helper: insere linha na tabela messages registrando o template enviado. */
async function appendMessageRow(opts: {
  conversationId: number;
  templateName: string;
  bodyText: string;
  waMessageId?: string;
}) {
  await appendMessage({
    conversationId: opts.conversationId,
    direction: "outbound",
    sender: "ai",
    contentType: "template",
    body: opts.bodyText,
    templateName: opts.templateName,
    waMessageId: opts.waMessageId,
    waStatus: opts.waMessageId ? "sent" : "queued",
  });
}

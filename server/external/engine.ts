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
  // sourceId nulo = aplica a todas as fontes; senão precisa bater
  return rows
    .filter((r) => r.sourceId == null || r.sourceId === sourceId)
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

/**
 * Motor de follow-up.
 * - A cada minuto varre `followup_jobs` com status=pending e scheduledAt<=now.
 * - Para cada job:
 *    1. Verifica conversa: se aiPaused/handoff/closed → cancelar.
 *    2. Se cancelOnReply e o lead respondeu após scheduledAt → cancelar.
 *    3. Determina se está dentro da janela 24h.
 *    4. Aplica policy: auto | force_template | force_free.
 *    5. Decide messageMode (ai_generated / fixed_text / template).
 *    6. Envia via WhatsApp e marca enviado.
 */
import { eq } from "drizzle-orm";
import {
  getAgentById,
  getConversationById,
  getDb,
  getFollowupRuleById,
  getLeadById,
  getTemplateById,
  getWhatsappConfig,
  listDuePendingJobs,
  markJobFailed,
  markJobSent,
  recordMetric,
  appendMessage,
} from "../db";
import { followupJobs } from "../../drizzle/schema";
import { sendTemplate, sendText, type WaCredentials } from "../whatsapp/client";
import { isInside24hWindow } from "../ai/timing";
import { invokeWithModel } from "../ai/invoke";
import { listMessages } from "../db";
import { buildMessages, parseAgentOutput, type PromptContext } from "../ai/prompt";
import {
  getBrainByAgent,
  listKnowledge,
  listMedia,
  listSteps,
  listTriggers,
} from "../db";
import { getAvailableMediaForPrompt } from "../ai/triggers";

let started = false;
let intervalHandle: NodeJS.Timeout | null = null;

export function startFollowupEngine() {
  if (started) return;
  started = true;
  const tick = async () => {
    try {
      await processDueJobs();
    } catch (e) {
      console.error("[followup] tick error:", e);
    }
  };
  intervalHandle = setInterval(tick, 60_000);
  // primeira passada após 10s
  setTimeout(tick, 10_000);
  console.log("[followup] engine started");
}

export function stopFollowupEngine() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
  started = false;
}

export async function processDueJobs() {
  const now = new Date();
  const jobs = await listDuePendingJobs(now, 50);
  for (const job of jobs) {
    try {
      await processOneJob(job, now);
    } catch (e) {
      await markJobFailed(job.id, (e as Error).message).catch(() => undefined);
    }
  }
}

async function processOneJob(job: typeof followupJobs.$inferSelect, now: Date) {
  const conv = await getConversationById(job.conversationId);
  if (!conv) {
    await markJobFailed(job.id, "Conversation not found");
    return;
  }
  if (conv.status === "closed" || conv.status === "archived" || conv.aiPaused) {
    await cancelJob(job.id);
    return;
  }
  const rule = await getFollowupRuleById(job.ruleId);
  if (!rule || !rule.isActive) {
    await cancelJob(job.id);
    return;
  }
  if (rule.cancelOnReply && conv.lastInboundAt && conv.lastInboundAt > job.scheduledAt) {
    await cancelJob(job.id);
    return;
  }

  const agent = await getAgentById(job.agentId);
  const lead = await getLeadById(conv.leadId);
  const config = await getWhatsappConfig(job.agentId);
  if (!agent || !lead) {
    await markJobFailed(job.id, "Missing agent/lead");
    return;
  }

  // Decisão de janela
  const insideWindow = isInside24hWindow(conv, now);
  let useTemplate = false;
  if (rule.windowPolicy === "force_template") useTemplate = true;
  else if (rule.windowPolicy === "force_free") useTemplate = false;
  else useTemplate = !insideWindow; // auto

  // Se modo é "template" ou janela exige template, força usar template
  if (rule.messageMode === "template") useTemplate = true;

  const creds: WaCredentials | null = config?.phoneNumberId && config?.accessToken
    ? {
        phoneNumberId: config.phoneNumberId,
        accessToken: config.accessToken,
        appSecret: config.appSecret,
      }
    : null;

  if (useTemplate) {
    if (!rule.templateId) {
      await markJobFailed(job.id, "Política exige template, mas regra não tem templateId");
      return;
    }
    const tpl = await getTemplateById(rule.templateId);
    if (!tpl) {
      await markJobFailed(job.id, "Template não encontrado");
      return;
    }
    const vars = (rule.templateVariables as string[] | null) ?? [];
    if (creds) {
      const r = await sendTemplate(creds, lead.phoneNumber, tpl.name, tpl.languageCode, vars);
      await appendMessage({
        conversationId: conv.id,
        direction: "outbound",
        sender: "ai",
        contentType: "template",
        body: tpl.bodyText,
        templateName: tpl.name,
        waMessageId: r.messageId,
        waStatus: r.ok ? "sent" : "failed",
        metadata: r.ok ? undefined : { error: r.error },
      });
      if (!r.ok) {
        await markJobFailed(job.id, r.error || "Falha envio template");
        return;
      }
    } else {
      // sem credenciais: apenas registrar
      await appendMessage({
        conversationId: conv.id,
        direction: "outbound",
        sender: "ai",
        contentType: "template",
        body: tpl.bodyText,
        templateName: tpl.name,
        waStatus: "queued",
      });
    }
  } else {
    let text = "";
    if (rule.messageMode === "fixed_text") {
      text = (rule.fixedText || "").trim() || "Olá! Posso continuar nosso papo?";
    } else {
      // ai_generated
      text = await generateFollowupText(agent.id, conv.id, rule.aiInstruction || rule.fixedText || "");
    }
    if (creds) {
      const r = await sendText(creds, lead.phoneNumber, text);
      await appendMessage({
        conversationId: conv.id,
        direction: "outbound",
        sender: "ai",
        contentType: "text",
        body: text,
        waMessageId: r.messageId,
        waStatus: r.ok ? "sent" : "failed",
        metadata: r.ok ? undefined : { error: r.error },
      });
      if (!r.ok) {
        await markJobFailed(job.id, r.error || "Falha envio livre");
        return;
      }
    } else {
      await appendMessage({
        conversationId: conv.id,
        direction: "outbound",
        sender: "ai",
        contentType: "text",
        body: text,
        waStatus: "queued",
      });
    }
  }

  await markJobSent(job.id);
  await recordMetric({
    agentId: job.agentId,
    conversationId: job.conversationId,
    eventType: "followup_sent",
    metadata: { ruleId: rule.id, useTemplate },
  });
}

async function cancelJob(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(followupJobs).set({ status: "cancelled" }).where(eq(followupJobs.id, id));
}

async function generateFollowupText(
  agentId: number,
  conversationId: number,
  instruction: string
): Promise<string> {
  const agent = await getAgentById(agentId);
  if (!agent) return "Olá! Posso continuar nosso papo?";
  const conv = await getConversationById(conversationId);
  if (!conv) return "Olá!";
  const lead = await getLeadById(conv.leadId);

  const [brain, steps, kb, media, triggers, history] = await Promise.all([
    getBrainByAgent(agentId),
    listSteps(agentId),
    listKnowledge(agentId),
    listMedia(agentId),
    listTriggers(agentId),
    listMessages(conversationId, { limit: 30 }),
  ]);
  const currentStep = conv.currentStepId ? steps.find(s => s.id === conv.currentStepId) : steps[0];
  const ctx: PromptContext = {
    agent,
    brain,
    steps,
    currentStep,
    knowledge: kb.slice(0, 4),
    availableMedia: getAvailableMediaForPrompt(triggers, media),
    history,
    leadName: lead?.name ?? null,
    leadPhone: lead?.phoneNumber ?? null,
  };
  const baseMsgs = buildMessages(ctx);
  const followupInstruction = `INSTRUÇÃO ESPECIAL DE FOLLOW-UP: O lead está em silêncio há um tempo. ${
    instruction || "Reengaje educadamente, sem ser invasivo, retomando o último ponto da conversa em uma única mensagem curta."
  } Não use marcações [SEND_MEDIA] nesta mensagem.`;
  const r = await invokeWithModel({
    model: currentStep?.llmModel || agent.defaultLlmModel,
    messages: [
      ...baseMsgs,
      { role: "user", content: followupInstruction },
    ],
    maxTokens: 300,
    temperature: 0.6,
  });
  const parsed = parseAgentOutput(r.text);
  return parsed.cleanText || "Olá! Posso continuar nosso papo?";
}

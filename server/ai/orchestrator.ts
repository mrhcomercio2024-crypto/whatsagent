/**
 * Orquestrador central do agente.
 * Dado uma mensagem inbound do lead, decide:
 *   1. Detecta gatilhos de mídia por palavra-chave
 *   2. Detecta palavra-chave de handoff
 *   3. Verifica horário de atendimento
 *   4. Chama LLM com cérebro + etapa atual + RAG
 *   5. Parseia output, envia mídias, avança etapa, dispara handoff
 *   6. Reagenda follow-ups
 *
 * Retorna a lista de ações que devem ser efetivamente executadas (envios).
 */
import {
  appendMessage,
  cancelPendingJobsForConversation,
  getBrainByAgent,
  getBusinessHours,
  getConversationById,
  getLeadById,
  getMediaById,
  getStepById,
  listHandoffKeywords,
  listKnowledge,
  listMedia,
  listMessages,
  listSteps,
  listTriggers,
  recordMetric,
  scheduleFollowupJobs,
  updateConversation,
  updateLead,
} from "../db";
import type { Agent } from "../../drizzle/schema";
import { invokeWithModel } from "./invoke";
import {
  buildMessages,
  buildSystemPrompt,
  findRestrictedHits,
  parseAgentOutput,
  selectKnowledge,
  type PromptContext,
} from "./prompt";
import { listRestrictedTerms } from "../db";
import {
  detectKeywordTriggers,
  detectStepTriggers,
  getAvailableMediaForPrompt,
} from "./triggers";
import { isWithinBusinessHours } from "./timing";
import { qualifyLead } from "./qualifier";

export type OutboundAction =
  | { type: "text"; text: string }
  | { type: "media"; mediaId: number };

export type ProcessResult = {
  actions: OutboundAction[];
  handoff: boolean;
  stepAdvanced: boolean;
  outOfHours: boolean;
};

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

export async function processInboundForReply(opts: {
  agent: Agent;
  conversationId: number;
  inboundText: string;
  isSimulation?: boolean;
}): Promise<ProcessResult> {
  const { agent, conversationId, inboundText } = opts;
  const conv = await getConversationById(conversationId);
  if (!conv) throw new Error("Conversation not found");
  const lead = await getLeadById(conv.leadId);

  // 0. Cancela follow-ups pendentes (lead respondeu)
  await cancelPendingJobsForConversation(conversationId);

  // 1. Handoff por palavra-chave
  const handoffKws = await listHandoffKeywords(agent.id);
  const inboundNorm = norm(inboundText);
  const handoffMatch = handoffKws.find(k => inboundNorm.includes(norm(k.keyword)));
  if (handoffMatch) {
    await updateConversation(conversationId, {
      status: "human_handoff",
      aiPaused: true,
    });
    await recordMetric({
      agentId: agent.id,
      conversationId,
      eventType: "handoff_triggered",
    });
    const actions: OutboundAction[] = [];
    if (handoffMatch.notifyMessage) {
      actions.push({ type: "text", text: handoffMatch.notifyMessage });
    } else {
      actions.push({
        type: "text",
        text: "Encaminhando você para um atendente humano. Aguarde só um instante.",
      });
    }
    return { actions, handoff: true, stepAdvanced: false, outOfHours: false };
  }

  // 2. Horário de atendimento
  const bh = await getBusinessHours(agent.id);
  if (!isWithinBusinessHours(bh)) {
    console.log(
      `[orchestrator] agent ${agent.id} conv ${conversationId}: OUT OF HOURS (bh.enabled=${bh?.enabled}, tz=${bh?.timezone})`
    );
    if (bh?.outOfHoursMessage && bh.outOfHoursMessage.trim()) {
      return {
        actions: [{ type: "text", text: bh.outOfHoursMessage }],
        handoff: false,
        stepAdvanced: false,
        outOfHours: true,
      };
    }
    // se não tem mensagem configurada, simplesmente não responde
    return { actions: [], handoff: false, stepAdvanced: false, outOfHours: true };
  }

  // 3. Carrega contexto
  const [brain, steps, allKnowledge, allMedia, triggers, history, restrictedRows] =
    await Promise.all([
      getBrainByAgent(agent.id),
      listSteps(agent.id),
      listKnowledge(agent.id),
      listMedia(agent.id),
      listTriggers(agent.id),
      listMessages(conversationId, { limit: 60 }),
      listRestrictedTerms(agent.id),
    ]);

  let currentStep = conv.currentStepId
    ? steps.find(s => s.id === conv.currentStepId)
    : steps[0];
  if (!currentStep && steps.length > 0) currentStep = steps[0];

  // 3.b MODO LITERAL: se a etapa atual define texto literal, despacha sem LLM
  if (currentStep?.literalMode && currentStep.literalText && currentStep.literalText.trim()) {
    const literal = currentStep.literalText.trim();
    const updates: any = {};
    if (!conv.currentStepId) updates.currentStepId = currentStep.id;
    // avança automaticamente se for obrigatória — mantemos comportamento simples
    if (Object.keys(updates).length > 0) await updateConversation(conversationId, updates);
    return {
      actions: [{ type: "text", text: literal }],
      handoff: false,
      stepAdvanced: false,
      outOfHours: false,
    };
  }

  const restricted = restrictedRows.map(r => ({ term: r.term, action: r.action as "block" | "rewrite" }));

  // 4. Mídias disparadas por gatilho explícito
  const sentIds = (conv.sentMediaIds as number[] | null) ?? [];
  const kwMedia = detectKeywordTriggers(triggers, inboundText, sentIds);
  const stepMedia = detectStepTriggers(triggers, currentStep?.id ?? null, sentIds);
  const triggeredMediaIds = Array.from(new Set([...kwMedia, ...stepMedia]));

  // 5. Seleciona conhecimento via RAG simples
  const recentText = [
    inboundText,
    ...history.slice(-6).map(m => m.body || ""),
  ].join(" ");
  const knowledgeRelevant = selectKnowledge(allKnowledge, recentText);

  const availableMedia = getAvailableMediaForPrompt(triggers, allMedia);

  const ctx: PromptContext = {
    agent,
    brain,
    steps,
    currentStep,
    knowledge: knowledgeRelevant,
    availableMedia,
    history,
    leadName: lead?.name ?? null,
    leadPhone: lead?.phoneNumber ?? null,
    restrictedTerms: restricted,
  };

  const messages = buildMessages(ctx);
  const model = currentStep?.llmModel?.trim() || agent.defaultLlmModel;

  const startedAt = Date.now();
  let aiOutput = "";
  try {
    console.log(
      `[orchestrator] agent ${agent.id} conv ${conversationId}: invoking LLM model=${model} (msgs=${messages.length})`
    );
    const r = await invokeWithModel({
      model,
      messages,
      maxTokens: 800,
      temperature: 0.5,
      tracking: {
        purpose: "orchestrator",
        agentId: agent.id,
        conversationId,
        leadId: lead?.id,
      },
    });
    aiOutput = r.text;
    console.log(
      `[orchestrator] LLM ok (${aiOutput.length} chars): ${aiOutput.slice(0, 120).replace(/\n/g, " ")}`
    );
  } catch (e) {
    console.error(
      `[orchestrator] LLM error for agent ${agent.id} model=${model}:`,
      (e as Error).message
    );
    aiOutput = "Desculpe, tive uma falha técnica. Pode repetir, por favor?";
  }
  await recordMetric({
    agentId: agent.id,
    conversationId,
    eventType: "response_time_ms",
    valueNumber: Date.now() - startedAt,
  });

  // VALIDADOR de termos proibidos: até 2 retentativas, depois sanitiza por substituição
  if (restricted.length > 0) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const hits = findRestrictedHits(aiOutput, restricted);
      if (hits.length === 0) break;
      const list = hits.map(h => `"${h.term}"`).join(", ");
      console.log(
        `[orchestrator] restricted terms detected (${list}); regenerating (attempt ${attempt + 1}/2)`
      );
      try {
        const r2 = await invokeWithModel({
          model,
          messages: [
            ...messages,
            { role: "assistant", content: aiOutput },
            {
              role: "user",
              content:
                `Sua última resposta contém termos proibidos: ${list}. ` +
                `REESCREVA exatamente a mesma intenção sem usar nenhuma dessas palavras (nem variantes). ` +
                `Mantenha o tom e o formato. Não explique a correção.`,
            },
          ],
          maxTokens: 600,
          temperature: 0.4,
          tracking: {
            purpose: "validator",
            agentId: agent.id,
            conversationId,
            leadId: lead?.id,
          },
        });
        aiOutput = r2.text || aiOutput;
      } catch (e) {
        console.warn("[orchestrator] validator regenerate failed:", (e as Error).message);
        break;
      }
    }
    // Último recurso: censura por substituição
    const stillHits = findRestrictedHits(aiOutput, restricted);
    if (stillHits.length > 0) {
      for (const h of stillHits) {
        const re = new RegExp(
          h.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "gi"
        );
        aiOutput = aiOutput.replace(re, "—");
      }
    }
  }

  const parsed = parseAgentOutput(aiOutput);

  // 6. Compor ações
  const actions: OutboundAction[] = [];
  // mídias por gatilho explícito vão primeiro
  for (const id of triggeredMediaIds) actions.push({ type: "media", mediaId: id });
  // mídias pedidas pela IA
  for (const id of parsed.mediaIds) {
    if (!triggeredMediaIds.includes(id)) actions.push({ type: "media", mediaId: id });
  }
  // texto principal
  if (parsed.cleanText) actions.push({ type: "text", text: parsed.cleanText });

  // 7. Atualizações de estado
  const updates: any = {};
  const newSentIds = [...sentIds];
  for (const a of actions) {
    if (a.type === "media" && !newSentIds.includes(a.mediaId)) {
      newSentIds.push(a.mediaId);
    }
  }
  if (newSentIds.length !== sentIds.length) updates.sentMediaIds = newSentIds;

  if (parsed.stepAdvance && currentStep) {
    const idx = steps.findIndex(s => s.id === currentStep!.id);
    const next = idx >= 0 && idx + 1 < steps.length ? steps[idx + 1] : null;
    if (next) updates.currentStepId = next.id;
  } else if (!conv.currentStepId && currentStep) {
    updates.currentStepId = currentStep.id;
  }

  if (parsed.handoff) {
    updates.status = "human_handoff";
    updates.aiPaused = true;
    await recordMetric({
      agentId: agent.id,
      conversationId,
      eventType: "handoff_triggered",
    });
  }

  if (Object.keys(updates).length > 0) {
    await updateConversation(conversationId, updates);
  }

  // 8. Qualificação a cada N mensagens (não bloqueia)
  if (history.length > 0 && history.length % 4 === 0 && lead) {
    const transcript = history.slice(-12).map(m => ({
      role: (m.direction === "inbound" ? "user" : "assistant") as "user" | "assistant",
      text: m.body || "",
    }));
    transcript.push({ role: "user", text: inboundText });
    qualifyLead({ history: transcript })
      .then(q => {
        if (q.temperature !== "unknown") {
          updateLead(lead.id, {
            temperature: q.temperature,
            qualificationNotes: q.reason,
          }).catch(() => undefined);
          recordMetric({
            agentId: agent.id,
            conversationId,
            eventType: "lead_qualified",
            metadata: { temperature: q.temperature },
          }).catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }

  return {
    actions,
    handoff: parsed.handoff || !!handoffMatch,
    stepAdvanced: parsed.stepAdvance,
    outOfHours: false,
  };
}

/**
 * Persiste mensagem de saída (texto/mídia) no DB.
 */
export async function persistOutboundActions(opts: {
  conversationId: number;
  agentId: number;
  actions: OutboundAction[];
  sender: "ai" | "human";
  waMessageIds?: Array<string | undefined>;
}) {
  const { conversationId, actions, sender, waMessageIds } = opts;
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    const waId = waMessageIds?.[i];
    if (a.type === "text") {
      await appendMessage({
        conversationId,
        direction: "outbound",
        sender,
        contentType: "text",
        body: a.text,
        waMessageId: waId,
      });
    } else if (a.type === "media") {
      const m = await getMediaById(a.mediaId);
      await appendMessage({
        conversationId,
        direction: "outbound",
        sender,
        contentType: (m?.mediaType ?? "image") as any,
        body: m?.caption ?? null,
        mediaUrl: m?.storageUrl ?? null,
        mediaId: a.mediaId,
        waMessageId: waId,
      });
    }
  }
}

/**
 * Helper para resolver step name pelo id (usado em UI)
 */
export async function resolveStepName(stepId: number | null | undefined) {
  if (!stepId) return null;
  const s = await getStepById(stepId);
  return s?.name ?? null;
}

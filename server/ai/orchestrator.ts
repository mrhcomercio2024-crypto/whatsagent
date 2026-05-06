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
  resetConversation,
  scheduleFollowupJobs,
  updateConversation,
  updateLead,
} from "../db";
import { isResetCommand, RESET_REPLY } from "./resetCommand";
import {
  countAiMessagesInCurrentStep,
  shouldAutoAdvanceByCount,
} from "./stepLimit";
import { canAdvanceStep, leadAskedQuestion, looksLikeStepSkip } from "./stepSkip";
import { refreshConversationSummary, shouldRefreshSummary } from "./summarizer";
import type { Agent } from "../../drizzle/schema";
import { invokeWithModel } from "./invoke";
import {
  buildMessages,
  buildSystemPrompt,
  findRestrictedHits,
  looksLikeStepLeak,
  parseAgentOutput,
  selectKnowledge,
  type PromptContext,
} from "./prompt";
import {
  listRestrictedTerms,
  listLeadStatusRules,
  getLeadStatusRuleBySlug,
} from "../db";
import { classifyLeadStatus } from "./statusClassifier";
import { isTrivialOutputInContext } from "./trivialOutputGuard";
import { detectRepetition } from "./antiRepetition";
import { resolveLeadNameForPrompt } from "./leadNameGuard";
import { filterMediaForTurn } from "./mediaCooldown";
import {
  detectObjection,
  recordObjectionDispatch,
  buildObjectionHint,
  type ObjectionMatch,
} from "./objectionHandler";
import {
  checkHeuristic as checkStepCompliance,
  buildRegenHint as buildStepRegenHint,
  type StepInfo as ComplianceStepInfo,
} from "./stepCompliance";
import {
  getLeadFacts,
  renderFactsForPrompt,
  extractAndSaveAsync,
} from "./leadFactsExtractor";
import { leadQuestionUnaddressed, classifyQuestion } from "./questionGuard";
import { classifyReaction, isReactionLikelyIgnored } from "./reactionClassifier";
import { notifyOwner } from "../_core/notification";
import {
  detectKeywordTriggers,
  detectStepTriggers,
  getAvailableMediaForPrompt,
} from "./triggers";
import { isWithinBusinessHours } from "./timing";
import { qualifyLead } from "./qualifier";
import { publish as publishRealtime } from "../realtime/bus";

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

  // 0.a Comando interno /limpar — reset total da conversa.
  if (isResetCommand(inboundText)) {
    await resetConversation(conversationId);
    return {
      actions: [{ type: "text", text: RESET_REPLY }],
      handoff: false,
      stepAdvanced: false,
      outOfHours: false,
    };
  }

  // 0. Cancela follow-ups pendentes (lead respondeu)
  await cancelPendingJobsForConversation(conversationId);

  // 0.b TRAVA POR STATUS AUTOMÁTICO já atribuído previamente.
  // Se o lead já foi marcado com uma tag bloqueante em um turno anterior,
  // não gastamos mais tokens — só repetimos a mensagem configurada.
  if (lead?.statusTag) {
    const existingRule = await getLeadStatusRuleBySlug(agent.id, lead.statusTag);
    if (existingRule && existingRule.isBlocking) {
      const reply = (existingRule.replyWhenBlocked || "").trim();
      if (reply) {
        return {
          actions: [{ type: "text", text: reply }],
          handoff: existingRule.handoffOnMatch,
          stepAdvanced: false,
          outOfHours: false,
        };
      }
      // Sem mensagem configurada: silencia (IA pausada, nada a dizer)
      return {
        actions: [],
        handoff: existingRule.handoffOnMatch,
        stepAdvanced: false,
        outOfHours: false,
      };
    }
  }

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

  // 3.0 CLASSIFICADOR DE STATUS AUTOMÁTICO (IA paralela)
  // Roda antes da geração normal. Se detectar uma regra, atualiza o lead e
  // — se for bloqueante — substitui a resposta pela replyWhenBlocked.
  try {
    const statusRules = await listLeadStatusRules(agent.id);
    if (statusRules.length > 0) {
      const histForClassifier = history.map(m => ({
        role: (m.direction === "inbound" ? "user" : "assistant") as "user" | "assistant",
        text: m.body || "",
      }));
      const classif = await classifyLeadStatus({
        rules: statusRules,
        history: histForClassifier,
        lastInboundText: inboundText,
        model: agent.defaultLlmModel,
        tracking: { agentId: agent.id, conversationId, leadId: lead?.id },
      });
      if (classif.slug) {
        const rule = statusRules.find(r => r.slug === classif.slug);
        if (rule) {
          // Atualiza o lead com a tag
          if (lead && lead.statusTag !== rule.slug) {
            await updateLead(lead.id, {
              statusTag: rule.slug,
              statusTagSetAt: new Date(),
            });
            console.log(
              `[orchestrator] lead ${lead.id} marcado com statusTag=${rule.slug} (${classif.reason})`
            );
          }
          if (rule.isBlocking) {
            // Handoff e pausa
            const convUpdate: any = { aiPaused: true };
            if (rule.handoffOnMatch) convUpdate.status = "human_handoff";
            await updateConversation(conversationId, convUpdate);
            await recordMetric({
              agentId: agent.id,
              conversationId,
              eventType: "status_block",
              metadata: { slug: rule.slug, reason: classif.reason },
            });
            if (rule.notifyOwnerOnMatch) {
              notifyOwner({
                title: `Lead marcado como '${rule.label}'`,
                content: `Lead ${lead?.name || lead?.phoneNumber || "desconhecido"} (agente ${agent.name}) foi classificado como '${rule.label}'. Motivo: ${classif.reason}. A IA foi pausada.`,
              }).catch(e =>
                console.warn("[orchestrator] notifyOwner falhou:", (e as Error).message)
              );
            }
            const reply = (rule.replyWhenBlocked || "").trim();
            if (reply) {
              return {
                actions: [{ type: "text", text: reply }],
                handoff: rule.handoffOnMatch,
                stepAdvanced: false,
                outOfHours: false,
              };
            }
            return {
              actions: [],
              handoff: rule.handoffOnMatch,
              stepAdvanced: false,
              outOfHours: false,
            };
          }
        }
      }
    }
  } catch (e) {
    console.warn("[orchestrator] status classifier falhou:", (e as Error).message);
  }

  // 3.a Auto-avanço por teto de mensagens da etapa: se a etapa atual tem
  // `maxMessages` configurado e a IA já enviou esse total nesta etapa, avança
  // ANTES de gerar a próxima resposta para não ficar presa.
  let stepAutoAdvancedByLimit = false;
  if (currentStep && currentStep.maxMessages && currentStep.maxMessages > 0) {
    const aiInStep = countAiMessagesInCurrentStep({
      messages: history as any,
      currentStepId: currentStep.id,
      conversationCurrentStepSince: conv.updatedAt as any,
    });
    if (shouldAutoAdvanceByCount(aiInStep, currentStep.maxMessages)) {
      const idx = steps.findIndex(s => s.id === currentStep!.id);
      const next = idx >= 0 && idx + 1 < steps.length ? steps[idx + 1] : null;
      if (next) {
        console.log(
          `[orchestrator] auto-advance step (max_messages=${currentStep.maxMessages}, count=${aiInStep}): ${currentStep.name} → ${next.name}`
        );
        await updateConversation(conversationId, { currentStepId: next.id });
        currentStep = next;
        stepAutoAdvancedByLimit = true;
      } else {
        // Última etapa: não tem para onde avançar; mantém, mas loga aviso
        console.warn(
          `[orchestrator] step ${currentStep.name} reached max_messages but no next step exists`
        );
      }
    }
  }

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

  // 4b. Mídias por intenção (classificador LLM enxuto)
  let intentMedia: number[] = [];
  try {
    const intentTriggers = triggers.filter(
      t => t.triggerType === "intent" && t.isActive && t.intentLabel
    );
    if (intentTriggers.length > 0) {
      const { classifyIntent, resolveMediaIdsFromIntents } = await import(
        "./intentClassifier"
      );
      // Deduplica definições por label (várias mídias podem compartilhar a mesma intenção)
      const defsMap = new Map<string, string>();
      for (const t of intentTriggers) {
        if (t.intentLabel && !defsMap.has(t.intentLabel)) {
          defsMap.set(t.intentLabel, t.intentDescription || "");
        }
      }
      const defs = Array.from(defsMap.entries()).map(([label, description]) => ({
        label,
        description,
      }));
      const { labels } = await classifyIntent({
        intents: defs,
        inboundText,
        agentId: agent.id,
        conversationId,
        leadId: conv.leadId,
      });
      intentMedia = resolveMediaIdsFromIntents(
        intentTriggers.map(t => ({
          triggerType: t.triggerType,
          isActive: t.isActive,
          mediaId: t.mediaId,
          intentLabel: t.intentLabel,
          sendOncePerConversation: t.sendOncePerConversation,
        })),
        labels,
        sentIds
      );
    }
  } catch (e) {
    console.warn("[orchestrator] intent classifier failed:", e);
  }

  const triggeredMediaIds = Array.from(
    new Set([...kwMedia, ...stepMedia, ...intentMedia])
  );

  // 5. Seleciona conhecimento via RAG simples
  const recentText = [
    inboundText,
    ...history.slice(-6).map(m => m.body || ""),
  ].join(" ");
  const knowledgeRelevant = selectKnowledge(allKnowledge, recentText);

  const availableMedia = getAvailableMediaForPrompt(triggers, allMedia);

  // Se há mídia aguardando reação, classifica a última mensagem do lead
  let mediaReactionCtx: PromptContext["mediaReaction"] = null;
  if (conv.awaitingReactionMediaId) {
    try {
      const media = await getMediaById(conv.awaitingReactionMediaId);
      if (media) {
        const mediaName = media.name || media.caption || `mídia #${media.id}`;
        const sentAt = conv.awaitingReactionSentAt
          ? new Date(conv.awaitingReactionSentAt).getTime()
          : null;
        const secondsSinceMedia = sentAt ? Math.max(0, (Date.now() - sentAt) / 1000) : undefined;
        if (isReactionLikelyIgnored(secondsSinceMedia, inboundText, mediaName)) {
          mediaReactionCtx = { reaction: "ignored", mediaName, bridge: null };
        } else {
          const r = await classifyReaction({
            mediaName,
            inboundText,
            secondsSinceMedia,
            agentId: agent.id,
            conversationId,
            leadId: lead?.id,
          });
          mediaReactionCtx = { reaction: r.reaction, mediaName, bridge: r.bridge };
        }
        try {
          await updateConversation(conversationId, {
            awaitingReactionMediaId: null,
            awaitingReactionSentAt: null,
            lastMediaReaction: mediaReactionCtx.reaction,
          } as any);
        } catch {}
      }
    } catch (e) {
      console.warn("[orchestrator] classifyReaction falhou:", (e as Error).message);
    }
  }

  // GUARD: só usamos `lead.name` no prompt se o lead REALMENTE se apresentou no chat.
  // Senão, o nome veio do perfil do WhatsApp/Z-API e não devemos confiar.
  const safeLeadName = resolveLeadNameForPrompt({
    history,
    dbName: lead?.name ?? null,
  });

  // ANTI-ALUC: detectar objeção no inbound atual (cache 60s no objectionHandler)
  let detectedObjection: ObjectionMatch | null = null;
  try {
    const det = await detectObjection(agent.id, conversationId, inboundText);
    detectedObjection = det.match;
    if (detectedObjection) {
      console.log(
        `[orchestrator] objeção detectada: "${detectedObjection.match.name}" (literal=${detectedObjection.match.literalResponse}, mediaIds=${detectedObjection.match.mediaIds.join(",")})`
      );
    }
  } catch (e) {
    console.warn("[orchestrator] detectObjection falhou:", (e as Error).message);
  }

  // SHORTCUT objeção literal: pula LLM, despacha texto + mídias direto
  if (detectedObjection && detectedObjection.match.literalResponse) {
    const obj = detectedObjection.match;
    const actions: OutboundAction[] = [];
    actions.push({ type: "text", text: obj.responseTemplate });
    for (const mid of obj.mediaIds) actions.push({ type: "media", mediaId: mid });
    try {
      await recordObjectionDispatch(conversationId, obj.id);
    } catch (e) {
      console.warn("[orchestrator] recordObjectionDispatch falhou:", (e as Error).message);
    }
    const updates: any = {};
    if (obj.nextStepAction === "advance" && currentStep) {
      const idx = steps.findIndex(s => s.id === currentStep!.id);
      const next = idx >= 0 && idx + 1 < steps.length ? steps[idx + 1] : null;
      if (next) updates.currentStepId = next.id;
    }
    if (Object.keys(updates).length > 0) await updateConversation(conversationId, updates);
    return {
      actions,
      handoff: false,
      stepAdvanced: !!updates.currentStepId,
      outOfHours: false,
    };
  }

  // ANTI-ALUC: carregar fatos já conhecidos do lead
  let leadFactsBlock: string | null = null;
  try {
    if (lead?.id) {
      const facts = await getLeadFacts(lead.id);
      const rendered = renderFactsForPrompt(facts);
      if (rendered) leadFactsBlock = rendered;
    }
  } catch (e) {
    console.warn("[orchestrator] getLeadFacts falhou:", (e as Error).message);
  }

  // ANTI-ALUC: hint de objeção (não-literal) injetado no prompt
  const objectionHint = detectedObjection ? buildObjectionHint(detectedObjection) : null;

  const ctx: PromptContext = {
    agent,
    brain,
    steps,
    currentStep,
    knowledge: knowledgeRelevant,
    availableMedia,
    history,
    leadName: safeLeadName,
    leadPhone: lead?.phoneNumber ?? null,
    restrictedTerms: restricted,
    conversationSummary: conv.summary ?? null,
    mediaReaction: mediaReactionCtx,
    leadFactsBlock,
    objectionHint,
  };

  const messages = buildMessages(ctx);
  const model = currentStep?.llmModel?.trim() || agent.defaultLlmModel;

  const startedAt = Date.now();
  let aiOutput = "";
  // Realtime: avisa o painel humano que a IA está "pensando"
  try {
    publishRealtime({
      type: "typing.agent",
      conversationId,
      phase: "thinking",
      stepName: currentStep?.name ?? null,
    });
  } catch {}
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

  // Detecta primeiro turno: nenhuma mensagem outbound da IA até agora
  const isFirstTurn = !history.some(
    h => h.direction === "outbound" && h.sender === "ai"
  );

  // VALIDADOR anti-vazamento de etapa: se a IA começou a "narrar" o script,
  // pedimos uma reescrita curta. Se persistir, devolvemos um fallback humano.
  {
    const leakReason = looksLikeStepLeak(aiOutput, currentStep);
    if (leakReason) {
      console.log(
        `[orchestrator] step leak detected (${leakReason}); regenerating once`
      );
      try {
        const r3 = await invokeWithModel({
          model,
          messages: [
            ...messages,
            { role: "assistant", content: aiOutput },
            {
              role: "user",
              content:
                `Sua última resposta vazou o sistema interno (motivo: ${leakReason}). ` +
                `REESCREVA SOMENTE como a próxima mensagem natural ao lead, em 1–3 frases curtas, ` +
                `como uma pessoa real digitaria no WhatsApp. ` +
                `NÃO cite "etapa", "objetivo", "critério", "script" ou qualquer estrutura. ` +
                `NÃO use listas numeradas nem markdown. NÃO explique nada.`,
            },
          ],
          maxTokens: 400,
          temperature: 0.5,
          tracking: {
            purpose: "validator",
            agentId: agent.id,
            conversationId,
            leadId: lead?.id,
          },
        });
        aiOutput = r3.text || aiOutput;
      } catch (e) {
        console.warn(
          "[orchestrator] step-leak regenerate failed:",
          (e as Error).message
        );
      }
      // Se ainda assim vazar, devolve um fallback mínimo humano em vez do dump.
      const stillLeak = looksLikeStepLeak(aiOutput, currentStep);
      if (stillLeak) {
        console.warn(
          `[orchestrator] step leak persisted (${stillLeak}); using safe fallback`
        );
        aiOutput =
          "Posso te perguntar uma coisa rapidinho pra te ajudar melhor?";
      }
    }
  }

  // VALIDADOR anti-pular-etapa: só atua em primeiro turno ou conversa muito
  // curta. Em conversa já andando confiamos no STEP_ADVANCE.
  const inboundCountForSkip = history.filter(
    h => h.direction === "inbound" && h.sender === "lead"
  ).length;
  if (currentStep && steps.length > 1) {
    // Última mensagem do lead (a inbound mais recente) determina se ele
    // fez uma pergunta direta — nesse caso liberamos o agente para responder
    // mesmo que o conteúdo pareça de uma etapa futura (vendedor flexível).
    const lastLeadMsg = [...history]
      .reverse()
      .find(h => h.direction === "inbound" && h.sender === "lead");
    const askedQuestion = leadAskedQuestion(lastLeadMsg?.body ?? null);
    const skip = looksLikeStepSkip(aiOutput, currentStep, steps as any, {
      firstTurn: isFirstTurn,
      inboundCount: inboundCountForSkip,
      leadAskedQuestion: askedQuestion,
    });
    if (skip.skipped) {
      console.log(
        `[orchestrator] step skip detectado (${skip.reason}; matched=${(skip.matchedKeywords||[]).join(",")}); regenerando 1x`
      );
      try {
        const stricterMessages = [
          ...messages,
          {
            role: "system" as const,
            content: `⚠️ Sua resposta anterior antecipou "${skip.jumpedTo}". Reescreva em 1–2 frases focando APENAS na etapa "${currentStep.name}".`,
          },
        ];
        const r2 = await invokeWithModel({
          model,
          messages: stricterMessages,
          maxTokens: 600,
          temperature: 0.4,
          tracking: {
            purpose: "orchestrator",
            agentId: agent.id,
            conversationId,
          },
        });
        const text2 = (r2.text || "").trim();
        if (text2) {
          // Mantemos a regen mesmo que ainda "pareça skip" — preferível à frase fixa repetida.
          aiOutput = text2;
        }
      } catch (e) {
        console.warn("[orchestrator] regen step skip falhou:", (e as Error).message);
      }
    }
  }

  // ANTI-REPETIÇÃO: detecta repetição exata OU paráfrase contra as ÚLTIMAS 3
  // mensagens da própria IA. Bloqueia se Jaccard >= 0.65~0.72 (vide antiRepetition.ts).
  {
    const lastThreeAi = [...history]
      .reverse()
      .filter(h => h.direction === "outbound" && h.sender === "ai" && (h.body || "").trim())
      .slice(0, 3)
      .map(h => h.body || "");
    const rep = detectRepetition(aiOutput, lastThreeAi);
    if (rep.repeats) {
      console.log(
        `[orchestrator] repetição detectada (${rep.reason}, sim=${rep.similarity?.toFixed(2)}); regenerando 1x`
      );
      const matchedExcerpt = (rep.matched || "").slice(0, 140);
      try {
        const r3 = await invokeWithModel({
          model,
          messages: [
            ...messages,
            { role: "assistant", content: aiOutput },
            {
              role: "system" as const,
              content:
                `⚠️ Sua resposta está repetindo (${rep.reason === "exact" ? "identicamente" : "em paráfrase"}) algo que você já enviou: "${matchedExcerpt}". ` +
                `Reaja à ÚLTIMA mensagem do lead com conteúdo COMPLETAMENTE NOVO, em 1–2 frases. ` +
                `NÃO reformule, NÃO repita conceito — traga uma informação ou pergunta diferente. ` +
                `Se não tiver nada novo a dizer, faça uma pergunta específica relacionada ao que o lead disse por último.`,
            },
          ],
          maxTokens: 500,
          temperature: 0.8,
          tracking: {
            purpose: "orchestrator",
            agentId: agent.id,
            conversationId,
          },
        });
        const text3 = (r3.text || "").trim();
        if (text3) {
          const rep2 = detectRepetition(text3, lastThreeAi);
          if (!rep2.repeats) {
            aiOutput = text3;
          } else {
            console.warn("[orchestrator] repetição persistiu após regen; mantendo a regen mesmo assim");
            aiOutput = text3;
          }
        }
      } catch (e) {
        console.warn("[orchestrator] regen anti-repetição falhou:", (e as Error).message);
      }
    }
  }

  // Bloqueia STEP_ADVANCE em primeiro turno (regra dura) — calculado mais abaixo,
  // após o guard anti greeting-loop (que pode reescrever aiOutput).
  const inboundCountInStep = history.filter(
    h => h.direction === "inbound" && h.sender === "lead"
  ).length;

  // VALIDADOR anti greeting-loop: o LLM às vezes responde só "Boa tarde!" quando
  // o histórico já contém saudações — padrão de "copy from history". Detectamos
  // ANTES de compor as ações para poder pular o envio se a regeneração falhar.
  {
    const parsedTmp = parseAgentOutput(aiOutput);
    const trivial = isTrivialOutputInContext({
      cleanText: parsedTmp.cleanText,
      hasMediaActions: parsedTmp.mediaIds.length > 0 || triggeredMediaIds.length > 0,
      isFirstAiTurn: isFirstTurn,
    });
    if (trivial) {
      console.log(
        `[orchestrator] greeting-loop detectado ("${parsedTmp.cleanText.slice(0,40)}"); regenerando 1x`
      );
      try {
        const r4 = await invokeWithModel({
          model,
          messages: [
            ...messages,
            { role: "assistant", content: aiOutput },
            {
              role: "user",
              content:
                `Sua última resposta foi APENAS um cumprimento ("${parsedTmp.cleanText}"), mas você já cumprimentou o lead antes nesta conversa. ` +
                `REESCREVA respondendo de fato à última mensagem do lead, com conteúdo útil, em 1–3 frases curtas. ` +
                `NÃO cumprimente de novo. NÃO explique nada — apenas escreva a próxima mensagem.`,
            },
          ],
          maxTokens: 400,
          temperature: 0.6,
          tracking: {
            purpose: "validator",
            agentId: agent.id,
            conversationId,
            leadId: lead?.id,
          },
        });
        const newOut = (r4.text || "").trim();
        if (newOut) {
          // Só aceita se a regeneração NÃO for trivial também
          const reparsed = parseAgentOutput(newOut);
          if (
            !isTrivialOutputInContext({
              cleanText: reparsed.cleanText,
              hasMediaActions: reparsed.mediaIds.length > 0 || triggeredMediaIds.length > 0,
              isFirstAiTurn: isFirstTurn,
            })
          ) {
            aiOutput = newOut;
          } else {
            console.warn(
              `[orchestrator] greeting-loop persistiu após regeneração; suprimindo envio para evitar spam`
            );
            aiOutput = ""; // SAFETY NET irá evitar spam: actions.length===0 deve apenas SILENCIAR neste caso.
          }
        }
      } catch (e) {
        console.warn("[orchestrator] greeting-loop regenerate failed:", (e as Error).message);
        aiOutput = "";
      }
    }
  }

  // VALIDADOR question-first: se o lead fez uma pergunta direta (preço, como
  // funciona, garantia, catálogo) e a saída da IA não contém marcadores de
  // resposta substantiva, regeneramos 1x exigindo a resposta antes de avançar.
  {
    const lastInboundForQ = [...history]
      .reverse()
      .find(h => h.direction === "inbound" && h.sender === "lead" && (h.body || "").trim());
    const lastInboundTextForQ = lastInboundForQ?.body || inboundText || "";
    const probe = leadQuestionUnaddressed({
      inboundText: lastInboundTextForQ,
      aiText: parseAgentOutput(aiOutput).cleanText,
    });
    if (probe.unaddressed) {
      console.log(
        `[orchestrator] pergunta direta não respondida (categoria=${probe.category}); regenerando 1x`
      );
      try {
        const r5 = await invokeWithModel({
          model,
          messages: [
            ...messages,
            { role: "assistant", content: aiOutput },
            {
              role: "user",
              content:
                `⚠️ O lead fez uma pergunta DIRETA (categoria: ${probe.category}) e você NÃO respondeu objetivamente. ` +
                `Releia a última mensagem do lead: "${(lastInboundTextForQ || "").slice(0, 200)}". ` +
                `RESPONDA primeiro a pergunta dele com base no Cérebro/Base de Conhecimento (preço, garantia, como funciona, catálogo, etc.). ` +
                `Se a informação não estiver no cérebro, diga educadamente que vai verificar. ` +
                `Depois, se fizer sentido, emende com 1 pergunta curta da etapa atual. ` +
                `1–3 frases, sem markdown, sem lista, sem ignorar a pergunta.`,
            },
          ],
          maxTokens: 500,
          temperature: 0.5,
          tracking: {
            purpose: "validator",
            agentId: agent.id,
            conversationId,
            leadId: lead?.id,
          },
        });
        const text5 = (r5.text || "").trim();
        if (text5) aiOutput = text5;
      } catch (e) {
        console.warn("[orchestrator] question-first regen falhou:", (e as Error).message);
      }
    }
  }

  // ANTI-ALUC: validador de step compliance (heurística). Se a saída viola
  // mustNotSay, está vazia/curta demais ou ignorou must_ask, regenera 1x.
  if (currentStep) {
    const stepInfo: ComplianceStepInfo = {
      id: currentStep.id,
      name: currentStep.name,
      objective: (currentStep as unknown as { objective?: string | null }).objective ?? null,
      mustAsk: (currentStep as unknown as { mustAsk?: string | null }).mustAsk ?? null,
      mustNotSay: (currentStep as unknown as { mustNotSay?: string | null }).mustNotSay ?? null,
      successSignals:
        (currentStep as unknown as { successSignals?: string | null }).successSignals ?? null,
    };
    const cleanForCheck = parseAgentOutput(aiOutput).cleanText;
    const compl = checkStepCompliance(cleanForCheck, stepInfo);
    if (!compl.passed) {
      console.log(
        `[orchestrator] step-compliance reprovou ("${currentStep.name}"): ${compl.reason}; regenerando 1x`
      );
      try {
        const lastInboundForRegen = [...history]
          .reverse()
          .find(h => h.direction === "inbound" && h.sender === "lead" && (h.body || "").trim());
        const lastInboundTxt = lastInboundForRegen?.body || inboundText || "";
        const regenHint = buildStepRegenHint(compl, stepInfo, lastInboundTxt);
        const r6 = await invokeWithModel({
          model,
          messages: [
            ...messages,
            { role: "assistant", content: aiOutput },
            { role: "user", content: regenHint },
          ],
          maxTokens: 600,
          temperature: 0.4,
          tracking: {
            purpose: "step_compliance_regen",
            agentId: agent.id,
            conversationId,
            leadId: lead?.id,
          },
        });
        const text6 = (r6.text || "").trim();
        if (text6) aiOutput = text6;
      } catch (e) {
        console.warn("[orchestrator] step-compliance regen falhou:", (e as Error).message);
      }
    }
  }

  // Parser FINAL (depois do guard anti greeting-loop e question-first)
  const parsed = parseAgentOutput(aiOutput);

  // Último inbound do lead para reforçar canAdvanceStep
  const lastLeadMsgForAdvance = [...history]
    .reverse()
    .find(h => h.direction === "inbound" && h.sender === "lead");
  const lastInboundIsQuestion =
    classifyQuestion(lastLeadMsgForAdvance?.body || inboundText || "") !== "none";

  const allowAdvance = canAdvanceStep({
    parsedAdvance: parsed.stepAdvance,
    isFirstTurn,
    inboundCountInStep,
    lastInboundText: lastLeadMsgForAdvance?.body ?? inboundText,
    lastInboundIsQuestion,
  });
  if (parsed.stepAdvance && !allowAdvance) {
    console.log(
      `[orchestrator] STEP_ADVANCE bloqueado (firstTurn=${isFirstTurn}, inbound=${inboundCountInStep}, isQuestion=${lastInboundIsQuestion})`
    );
  }

  // FILTRO DE MÍDIAS: aplica idempotência (já enviadas), cooldown 60s e
  // limite de 1 mídia por turno para evitar duplicatas/spam.
  // Inclui também mídias da objeção detectada (caso não-literal).
  const objectionMediaIds = detectedObjection ? detectedObjection.match.mediaIds : [];
  const proposedMediaIds = Array.from(
    new Set([...triggeredMediaIds, ...parsed.mediaIds, ...objectionMediaIds])
  );
  const mediaFilter = filterMediaForTurn({
    proposedIds: proposedMediaIds,
    alreadySentIds: sentIds,
    history,
  });
  if (mediaFilter.dropped.length > 0) {
    console.log(
      `[orchestrator] mídias filtradas: ${mediaFilter.dropped
        .map(d => `${d.id}(${d.reason})`)
        .join(", ")}`
    );
  }
  const allowedMediaIds = mediaFilter.allowed;

  // 6. Compor ações
  const actions: OutboundAction[] = [];
  for (const id of allowedMediaIds) actions.push({ type: "media", mediaId: id });
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

  // Se vamos despachar mídia, marcamos "aguardando reação" para classificar a próxima
  // mensagem do lead. Usamos o ÚLTIMO mediaId da rajada para não sobrescrever.
  const newMedia = actions.filter(a => a.type === "media") as { type: "media"; mediaId: number }[];
  if (newMedia.length > 0) {
    updates.awaitingReactionMediaId = newMedia[newMedia.length - 1].mediaId;
    updates.awaitingReactionSentAt = new Date();
    updates.lastMediaReaction = null;
  }

  if (allowAdvance && currentStep) {
    const idx = steps.findIndex(s => s.id === currentStep!.id);
    const next = idx >= 0 && idx + 1 < steps.length ? steps[idx + 1] : null;
    if (next) updates.currentStepId = next.id;
  } else if (!conv.currentStepId && currentStep) {
    // Persiste a etapa atual desde a 1ª resposta da IA, mesmo sem advance
    updates.currentStepId = currentStep.id;
  } else if (stepAutoAdvancedByLimit && currentStep) {
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

  // ANTI-ALUC: marca objeção como despachada (assim não repete na mesma conversa)
  if (detectedObjection) {
    try {
      await recordObjectionDispatch(conversationId, detectedObjection.match.id);
    } catch (e) {
      console.warn(
        "[orchestrator] recordObjectionDispatch (não-literal) falhou:",
        (e as Error).message
      );
    }
  }

  // ANTI-ALUC: extrair fatos do lead em background (fire-and-forget) com modelo barato.
  // Usa o histórico atualizado (incluindo o turno corrente) para não perder informação.
  if (lead?.id && history.length >= 2) {
    try {
      const historyForFacts = [
        ...history.map(m => ({
          role: (m.direction === "inbound" ? "user" : "assistant") as "user" | "assistant",
          content: m.body || "",
        })),
        { role: "user" as const, content: inboundText },
      ];
      const existing = await getLeadFacts(lead.id).catch(() => ({}));
      extractAndSaveAsync(lead.id, historyForFacts, existing, agent.defaultLlmModel, {
        agentId: agent.id,
        conversationId,
      });
    } catch (e) {
      console.warn("[orchestrator] extractAndSaveAsync setup falhou:", (e as Error).message);
    }
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

  // Realtime: "writing" antes do dispatcher engatar typing/sleep e "idle" ao final.
  try {
    publishRealtime({
      type: "typing.agent",
      conversationId,
      phase: actions.length > 0 ? "writing" : "idle",
      stepName: currentStep?.name ?? null,
    });
  } catch {}

  // Atualiza o RESUMO da conversa em background quando passamos do limite de
  // mensagens novas desde o último resumo. Não bloqueamos a resposta.
  try {
    const total = (history?.length ?? 0) + 1; // +1 inbound atual
    if (
      shouldRefreshSummary({
        totalMessages: total,
        lastSummaryAtMessages: conv.summary ? total - 1 : null,
        every: agent.summaryEveryN ?? 6,
      })
    ) {
      void refreshConversationSummary({
        agent,
        conversationId,
        previousSummary: conv.summary ?? null,
      });
    }
  } catch {
    // não queremos derrubar a resposta caso o resumidor falhe.
  }

  // SAFETY NET: actions vazias em conversa normal.
  // Antes:  caíamos num fallback genérico ("Pode me contar um pouco mais...")
  // Problema: greeting-loop suprimia aiOutput de propósito — e o fallback acabava
  // mandando texto genérico que o lead já viu antes (poluindo a conversa).
  // Agora:  se aiOutput estava vazio ANTES do parser (sintoma de loop suprimido),
  // SILENCIAMOS — é melhor não responder do que repetir bobeira.
  if (actions.length === 0 && !parsed.handoff) {
    if (!aiOutput.trim()) {
      console.warn(
        `[orchestrator] suprimindo envio em conv ${conversationId} (greeting-loop ou LLM vazio após regeneração)`
      );
      // NÃO empurra fallback: melhor silêncio do que spam.
    } else {
      console.warn(
        `[orchestrator] actions vazias em conv ${conversationId} (LLM devolveu '${aiOutput.slice(0,80)}'); usando fallback neutro`
      );
      actions.push({
        type: "text",
        text: "Pode me contar um pouco mais? Quero te entender melhor pra te ajudar do jeito certo.",
      });
    }
  }

  return {
    actions,
    handoff: parsed.handoff || !!handoffMatch,
    stepAdvanced: allowAdvance,
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
  // Aviso de "delivering" para a UI antes de cada balão ser persistido
  try {
    publishRealtime({ type: "typing.agent", conversationId, phase: "delivering" });
  } catch {}
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
  // Fecha o ciclo de digitação do agente para a UI "ao vivo".
  try {
    publishRealtime({ type: "typing.agent", conversationId, phase: "idle" });
  } catch {}
}

/**
 * Helper para resolver step name pelo id (usado em UI)
 */
export async function resolveStepName(stepId: number | null | undefined) {
  if (!stepId) return null;
  const s = await getStepById(stepId);
  return s?.name ?? null;
}

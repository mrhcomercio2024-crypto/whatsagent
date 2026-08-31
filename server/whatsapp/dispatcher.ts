/**
 * Despacha as ações decididas pelo orquestrador via WhatsApp Cloud API
 * (texto + mídias). Persiste mensagens enviadas e agenda follow-ups.
 */
import {
  appendMessage,
  getConversationById,
  getLeadById,
  getMediaById,
  getWhatsappConfig,
  scheduleFollowupJobs,
  recordMetric,
} from "../db";
import type { Agent } from "../../drizzle/schema";
import {
  sendImage,
  sendText,
  sendVideo,
  sendDocument,
  sendTypingOn,
  type WaCredentials,
} from "./client";
import type { OutboundAction } from "../ai/orchestrator";
import {
  pauseBetweenMessages,
  pauseBeforeMedia,
  pauseAfterMedia,
  simulateTypingForMessage,
} from "../ai/humanize";
import { listMessages } from "../db";
import { splitMessage } from "../ai/splitter";
import {
  buildOutboundKey,
  wasRecentlySent,
  markSent,
} from "./idempotency";
import { resolvePublicMediaUrl } from "./mediaUrlResolver";

/**
 * Roteia o envio para o transporte correto conforme o modo do agente:
 * - 'official' → Meta Cloud API
 * - 'qr'       → Baileys (não oficial)
 */
export async function dispatchActions(opts: {
  agent: Agent;
  conversationId: number;
  actions: OutboundAction[];
  sender: "ai" | "human";
}): Promise<void> {
  // TRAVA DE IDEMPOTÊNCIA: filtra ações repetidas em janela de 90s
  // (somente para envios da IA; humano pode reenviar de propósito).
  const filtered =
    opts.sender === "ai"
      ? opts.actions.filter(a => {
          const key = buildOutboundKey(a);
          if (wasRecentlySent(opts.conversationId, key)) {
            console.warn(
              `[dispatch] DUPLICATE blocked conv=${opts.conversationId} type=${a.type} key=${key}`
            );
            return false;
          }
          markSent(opts.conversationId, key);
          return true;
        })
      : opts.actions;

  if (filtered.length === 0) {
    console.warn(
      `[dispatch] all ${opts.actions.length} action(s) blocked by idempotency for conv=${opts.conversationId}`
    );
    return;
  }
  const safeOpts = { ...opts, actions: filtered };

  const conversation = await getConversationById(opts.conversationId);
  if (conversation?.channel === "instagram") {
    const { dispatchInstagramActions } = await import("../instagram/adapter");
    await dispatchInstagramActions(safeOpts);
    return;
  }

  if (opts.agent.connectionMode === "qr") {
    // Modo "qr" agora usa Z-API por baixo (Baileys descontinuado).
    // O nome "qr" é mantido por compatibilidade com agentes existentes.
    await dispatchActionsZapi(safeOpts);
    // ainda agenda follow-ups (mesma lógica)
    const { scheduleFollowupJobs } = await import("../db");
    await scheduleFollowupJobs(opts.agent.id, opts.conversationId, new Date());
    return;
  }
  if (opts.agent.connectionMode === "zapi") {
    await dispatchActionsZapi(safeOpts);
    return;
  }
  await dispatchActionsOfficial(safeOpts);
}

export async function dispatchActionsOfficial(opts: {
  agent: Agent;
  conversationId: number;
  actions: OutboundAction[];
  sender: "ai" | "human";
}): Promise<void> {
  const { agent, conversationId, actions, sender } = opts;
  const config = await getWhatsappConfig(agent.id);
  const conv = await getConversationById(conversationId);
  if (!conv) return;
  const lead = await getLeadById(conv.leadId);
  if (!lead) return;

  if (!config?.phoneNumberId || !config?.accessToken) {
    // Sem credenciais: apenas grava o que seria enviado
    for (const a of actions) await persistAction(conversationId, a, sender, undefined, undefined);
    return;
  }

  const creds: WaCredentials = {
    phoneNumberId: config.phoneNumberId,
    accessToken: config.accessToken,
    appSecret: config.appSecret,
  };

  // Expande mensagens de texto longas em vários balões (apenas para envios da IA)
  const expanded: OutboundAction[] =
    sender === "ai"
      ? actions.flatMap<OutboundAction>((a) =>
          a.type === "text"
            ? splitMessage(a.text, {
                enabled: agent.splitLongMessages,
                maxChars: agent.splitMaxChars,
              }).map((piece) => ({ type: "text" as const, text: piece }))
            : [a],
        )
      : actions;

  // Recupera o waMessageId do último inbound do lead, para acionar o
  // typing_indicator da Meta (a Cloud API exige passar o id da última mensagem).
  let lastInboundWaId: string | undefined;
  if (sender === "ai" && agent.typingSimulationEnabled) {
    try {
      const msgs = await listMessages(conversationId, { limit: 30 });
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (m.direction === "inbound" && m.waMessageId) {
          lastInboundWaId = m.waMessageId;
          break;
        }
      }
    } catch {
      /* ignora */
    }
  }

  const setTyping =
    sender === "ai" && agent.typingSimulationEnabled && lastInboundWaId
      ? async (state: "on" | "off") => {
          if (state === "on") {
            await sendTypingOn(creds, lastInboundWaId!);
          }
          // Meta não tem 'off' explícito — o indicador some ao enviar a próxima
          // mensagem ou após ~25s.
        }
      : undefined;

  // Flag para evitar loop quando a tentativa já é do retry-worker
  const __isRetry = (opts as any).__isRetry as { retryId: number } | undefined;

  // Realtime: avisa o painel "ao vivo" do total de balões após expansão
  let __realtime: typeof import("../realtime/bus") | null = null;
  if (sender === "ai" && !__isRetry) {
    try {
      __realtime = await import("../realtime/bus");
      __realtime.publish(
        {
          type: "pipeline",
          conversationId,
          phase: "composed",
          messageCount: expanded.length,
          label:
            expanded.length > 1
              ? `IA preparando ${expanded.length} balões`
              : "IA pronta para enviar",
        },
        agent.id
      );
    } catch {}
  }

  for (let i = 0; i < expanded.length; i++) {
    const a = expanded[i];
    if (__realtime && sender === "ai" && !__isRetry) {
      try {
        __realtime.publish(
          {
            type: "pipeline",
            conversationId,
            phase: "sending",
            messageIndex: i,
            messageCount: expanded.length,
            label:
              expanded.length > 1
                ? `Enviando balão ${i + 1}/${expanded.length}…`
                : "Enviando resposta…",
          },
          agent.id
        );
      } catch {}
    }
    // Pausa natural ANTES da mídia (humano "procurando/anexando")
    if (sender === "ai" && a.type === "media" && i > 0) {
      await pauseBeforeMedia(agent);
    }
    // Simulação de digitação antes de enviar (apenas para texto)
    if (sender === "ai" && a.type === "text") {
      await simulateTypingForMessage({
        agent,
        textLength: a.text.length,
        setTyping,
      });
    }

    let waId: string | undefined;
    let errorMsg: string | undefined;
    if (a.type === "text") {
      const r = await sendText(creds, lead.phoneNumber, a.text);
      waId = r.messageId;
      errorMsg = r.ok ? undefined : r.error;
    } else if (a.type === "media") {
      const m = await getMediaById(a.mediaId);
      if (m?.storageUrl) {
        const fullUrl = absolutize(m.storageUrl);
        const fn =
          m.mediaType === "image"
            ? sendImage
            : m.mediaType === "video"
            ? sendVideo
            : sendDocument;
        const r = await fn(
          creds,
          lead.phoneNumber,
          fullUrl,
          m.caption ?? undefined,
        );
        waId = r.messageId;
        errorMsg = r.ok ? undefined : r.error;
      } else {
        errorMsg = "Mídia sem URL";
      }
    }
    await persistAction(conversationId, a, sender, waId, errorMsg);

    // [Fase 90] DLQ: registramos a falha para que o usuário possa REENVIAR
    // MANUALMENTE em /retries. NUNCA reagendamos automaticamente — por isso
    // gravamos `nextRetryAt = null` e `maxAttempts = 1` (uma execução única
    // quando o usuário clicar "Reenviar agora").
    if (errorMsg && !__isRetry) {
      try {
        const { enqueueMessageRetry } = await import("../db");
        const payload =
          a.type === "text"
            ? { type: "text", text: a.text }
            : { type: "media", mediaId: (a as any).mediaId };
        await enqueueMessageRetry({
          agentId: agent.id,
          conversationId,
          leadId: lead.id,
          payload: payload as any,
          sender: sender === "ai" ? "ai" : "operator",
          attempt: 0,
          maxAttempts: 1,
          nextRetryAt: null as any, // pausado: reenvio só manual
          status: "pending",
          lastError: errorMsg,
        });
        console.log(
          `[dispatch-cloud] enqueued DLQ (paused, manual-only) conv=${conversationId} type=${a.type} err=${errorMsg}`
        );
      } catch (eq) {
        console.error(
          `[dispatch-cloud] failed to enqueue DLQ: ${(eq as Error).message}`
        );
      }
    }

    await recordMetric({
      agentId: agent.id,
      conversationId,
      eventType: "message_sent",
    });

    // Pausa entre mensagens consecutivas
    if (sender === "ai" && i < expanded.length - 1) {
      if (a.type === "media") {
        // Depois de uma mídia, pausa maior (dá tempo do lead reagir)
        await pauseAfterMedia(agent);
      } else {
        await pauseBetweenMessages(agent);
      }
    }
  }

  if (__realtime && sender === "ai" && !__isRetry) {
    try {
      __realtime.publish(
        {
          type: "pipeline",
          conversationId,
          phase: "sent",
          messageCount: expanded.length,
          label:
            expanded.length > 1
              ? `${expanded.length} mensagens entregues`
              : expanded.length === 1
              ? "Mensagem entregue"
              : "Sem mensagens a enviar",
        },
        agent.id
      );
    } catch {}
  }

  // (Re)agendar follow-ups com base no momento atual (agente respondeu agora)
  await scheduleFollowupJobs(agent.id, conversationId, new Date());
}

async function persistAction(
  conversationId: number,
  a: OutboundAction,
  sender: "ai" | "human",
  waId: string | undefined,
  errorMsg: string | undefined
) {
  if (a.type === "text") {
    await appendMessage({
      conversationId,
      direction: "outbound",
      sender,
      contentType: "text",
      body: a.text,
      waMessageId: waId,
      waStatus: errorMsg ? "failed" : "sent",
      metadata: errorMsg ? { error: errorMsg } : undefined,
    });
  } else {
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
      waStatus: errorMsg ? "failed" : "sent",
      metadata: errorMsg ? { error: errorMsg } : undefined,
    });
  }
}

/**
 * /manus-storage/... → URL absoluta acessível pela Meta.
 * Fora do sandbox, defina PUBLIC_BASE_URL no .env.
 */
function absolutize(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const base = process.env.PUBLIC_BASE_URL || "";
  if (!base) return url;
  return base.replace(/\/$/, "") + url;
}


/**
 * Despacha ações via Z-API (provedor não-oficial).
 * Mesmo formato de persistência e DLQ do caminho oficial; só muda o transporte.
 */
export async function dispatchActionsZapi(opts: {
  agent: Agent;
  conversationId: number;
  actions: OutboundAction[];
  sender: "ai" | "human";
}): Promise<void> {
  const { agent, conversationId, actions, sender } = opts;
  const { getZapiInstance } = await import("../db");
  const zapi = await getZapiInstance(agent.id);
  const conv = await getConversationById(conversationId);
  if (!conv) return;
  const lead = await getLeadById(conv.leadId);
  if (!lead) return;

  if (!zapi?.instanceId || !zapi?.token) {
    for (const a of actions) await persistAction(conversationId, a, sender, undefined, "Z-API não configurada");
    return;
  }

  const {
    sendText: zSendText,
    sendImage: zSendImage,
    sendVideo: zSendVideo,
    sendAudio: zSendAudio,
    sendDocument: zSendDocument,
    sendPresence: zSendPresence,
  } = await import("./zapi");

  const creds = {
    instanceId: zapi.instanceId,
    token: zapi.token,
    clientToken: zapi.clientToken,
  };

  // Expansão de mensagens longas em vários balões (mesma regra do caminho oficial)
  const expanded: OutboundAction[] =
    sender === "ai"
      ? actions.flatMap<OutboundAction>((a) =>
          a.type === "text"
            ? splitMessage(a.text, {
                enabled: agent.splitLongMessages,
                maxChars: agent.splitMaxChars,
              }).map((piece) => ({ type: "text" as const, text: piece }))
            : [a],
        )
      : actions;

  // Flag para evitar loop quando a tentativa já é do retry-worker
  const __isRetry = (opts as any).__isRetry as { retryId: number } | undefined;

  // Realtime: avisa o painel "ao vivo" do total de balões após expansão
  let __realtime: typeof import("../realtime/bus") | null = null;
  if (sender === "ai" && !__isRetry) {
    try {
      __realtime = await import("../realtime/bus");
      __realtime.publish(
        {
          type: "pipeline",
          conversationId,
          phase: "composed",
          messageCount: expanded.length,
          label:
            expanded.length > 1
              ? `IA preparando ${expanded.length} balões`
              : "IA pronta para enviar",
        },
        agent.id
      );
    } catch {}
  }

  for (let i = 0; i < expanded.length; i++) {
    const a = expanded[i];
    if (__realtime && sender === "ai" && !__isRetry) {
      try {
        __realtime.publish(
          {
            type: "pipeline",
            conversationId,
            phase: "sending",
            messageIndex: i,
            messageCount: expanded.length,
            label:
              expanded.length > 1
                ? `Enviando balão ${i + 1}/${expanded.length}…`
                : "Enviando resposta…",
          },
          agent.id
        );
      } catch {}
    }
    if (sender === "ai" && a.type === "media" && i > 0) {
      await pauseBeforeMedia(agent);
    }
    if (sender === "ai" && a.type === "text") {
      // 1) Disparamos o presence "composing" — isso aciona o indicador
      //    "...digitando" no WhatsApp do lead, igual a uma pessoa real digitando.
      //    A Z-API expira esse status sozinha; não bloqueamos no resultado.
      if (agent.typingSimulationEnabled) {
        zSendPresence(creds, lead.phoneNumber, "composing").catch((e: unknown) =>
          console.warn(
            `[dispatch-zapi] sendPresence falhou (não-fatal): ${(e as Error).message}`
          )
        );
      }
      // 2) Aguarda o tempo proporcional ao tamanho do texto antes de enviar
      //    (humanização real — além do delayTyping interno do client).
      await simulateTypingForMessage({ agent, textLength: a.text.length });
    }

    let waId: string | undefined;
    let errorMsg: string | undefined;
    if (a.type === "text") {
      const r = await zSendText(creds, lead.phoneNumber, a.text);
      waId = r.messageId;
      errorMsg = r.ok ? undefined : r.error;
    } else if (a.type === "media") {
      const m = await getMediaById(a.mediaId);
      if (m?.storageUrl) {
        const fullUrl = absolutize(m.storageUrl);
        // Z-API precisa BAIXAR a URL do servidor dela. Caminhos /manus-storage/...
        // são internos: precisamos resolvê-los para uma URL S3/CloudFront pública
        // assinada, senão a Z-API rejeita com "Base64/Url could not be read".
        let publicUrl = fullUrl;
        try {
          publicUrl = await resolvePublicMediaUrl(m.storageUrl, m.storageKey);
        } catch (eUrl) {
          errorMsg = `Falha ao resolver URL pública da mídia: ${(eUrl as Error).message}`;
        }

        if (!errorMsg) {
          if (m.mediaType === "image") {
            const r = await zSendImage(creds, lead.phoneNumber, publicUrl, m.caption ?? undefined);
            waId = r.messageId;
            errorMsg = r.ok ? undefined : r.error;
          } else if (m.mediaType === "video") {
            const r = await zSendVideo(creds, lead.phoneNumber, publicUrl, m.caption ?? undefined);
            waId = r.messageId;
            errorMsg = r.ok ? undefined : r.error;
          } else if (m.mediaType === "audio") {
            const r = await zSendAudio(creds, lead.phoneNumber, publicUrl);
            waId = r.messageId;
            errorMsg = r.ok ? undefined : r.error;
          } else {
            // document
            const ext =
              (m.storageUrl.split(".").pop() || "pdf").split("?")[0].toLowerCase() || "pdf";
            const r = await zSendDocument(
              creds,
              lead.phoneNumber,
              publicUrl,
              m.caption ?? undefined,
              ext,
            );
            waId = r.messageId;
            errorMsg = r.ok ? undefined : r.error;
          }
        }
      } else {
        errorMsg = "Mídia sem URL";
      }
    }
    await persistAction(conversationId, a, sender, waId, errorMsg);

    // [Fase 90] DLQ pausada: reenvio só manual via /retries.
    if (errorMsg && !__isRetry) {
      try {
        const { enqueueMessageRetry } = await import("../db");
        const payload =
          a.type === "text"
            ? { type: "text", text: a.text }
            : { type: "media", mediaId: (a as any).mediaId };
        await enqueueMessageRetry({
          agentId: agent.id,
          conversationId,
          leadId: lead.id,
          payload: payload as any,
          sender: sender === "ai" ? "ai" : "operator",
          attempt: 0,
          maxAttempts: 1,
          nextRetryAt: null as any, // pausado: reenvio só manual
          status: "pending",
          lastError: errorMsg,
        });
        console.log(
          `[dispatch-zapi] enqueued DLQ (paused, manual-only) conv=${conversationId} type=${a.type} err=${errorMsg}`
        );
      } catch (eq) {
        console.error(
          `[dispatch-zapi] failed to enqueue DLQ: ${(eq as Error).message}`
        );
      }
    }

    await recordMetric({
      agentId: agent.id,
      conversationId,
      eventType: "message_sent",
    });

    if (sender === "ai" && i < expanded.length - 1) {
      if (a.type === "media") await pauseAfterMedia(agent);
      else await pauseBetweenMessages(agent);
    }
  }

  if (__realtime && sender === "ai" && !__isRetry) {
    try {
      __realtime.publish(
        {
          type: "pipeline",
          conversationId,
          phase: "sent",
          messageCount: expanded.length,
          label:
            expanded.length > 1
              ? `${expanded.length} mensagens entregues`
              : expanded.length === 1
              ? "Mensagem entregue"
              : "Sem mensagens a enviar",
        },
        agent.id
      );
    } catch {}
  }

  await scheduleFollowupJobs(agent.id, conversationId, new Date());
}

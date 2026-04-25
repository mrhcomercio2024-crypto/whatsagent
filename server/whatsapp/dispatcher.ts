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
  simulateTypingForMessage,
} from "../ai/humanize";
import { listMessages } from "../db";
import { splitMessage } from "../ai/splitter";

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
  if (opts.agent.connectionMode === "qr") {
    const { dispatchViaBaileys } = await import("./baileys");
    await dispatchViaBaileys(opts);
    // ainda agenda follow-ups (mesma lógica)
    const { scheduleFollowupJobs } = await import("../db");
    await scheduleFollowupJobs(opts.agent.id, opts.conversationId, new Date());
    return;
  }
  await dispatchActionsOfficial(opts);
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

  for (let i = 0; i < expanded.length; i++) {
    const a = expanded[i];
    // Simulação de digitação antes de enviar
    if (sender === "ai") {
      const textLen =
        a.type === "text"
          ? a.text.length
          : Math.max(20, (await getMediaById(a.mediaId))?.caption?.length ?? 0);
      await simulateTypingForMessage({
        agent,
        textLength: textLen,
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
    await recordMetric({
      agentId: agent.id,
      conversationId,
      eventType: "message_sent",
    });

    // Pausa entre mensagens consecutivas
    if (sender === "ai" && i < expanded.length - 1) {
      await pauseBetweenMessages(agent);
    }
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

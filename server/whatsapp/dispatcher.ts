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
  type WaCredentials,
} from "./client";
import type { OutboundAction } from "../ai/orchestrator";

export async function dispatchActions(opts: {
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

  for (const a of actions) {
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
          // sendDocument tem um arg a mais (filename) que ignoramos
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

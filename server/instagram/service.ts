import { MetaInstagramError, getInstagramUserProfile } from "./client";
import { decryptInstagramToken } from "./crypto";
import {
  claimInstagramEvent,
  completeInstagramEvent,
  createOrGetInstagramEvent,
  failInstagramEvent,
  findInstagramMessageByProviderId,
  getInstagramIntegrationByAccount,
  logInstagram,
  resolveInstagramIdentity,
  updateInstagramIntegration,
} from "./db";
import { normalizeInstagramWebhook, type NormalizedInstagramEvent } from "./parser";
import {
  appendMessage,
  getAgentById,
  getConversationById,
  recordMetric,
  setConversationPendingProcessAt,
} from "../db";
import { nextProcessAt } from "../ai/humanize";
import { dispatchActions } from "../whatsapp/dispatcher";

function sanitizedChannelMetadata(event: NormalizedInstagramEvent) {
  return {
    source: "instagram_direct",
    referral: event.referral,
    adId: event.referral?.ad_id ?? event.adsContextData?.ad_id ?? null,
    adsContextData: event.adsContextData,
    replyTo: event.replyTo,
  };
}

function inboundBody(event: NormalizedInstagramEvent) {
  if (event.text) return event.text;
  if (event.attachmentType) return `[${event.attachmentType} recebido pelo Instagram]`;
  return "[interação recebida pelo Instagram]";
}

async function handleEvent(event: NormalizedInstagramEvent) {
  const integration = await getInstagramIntegrationByAccount(event.accountId);
  const stored = await createOrGetInstagramEvent({
    integrationId: integration?.id ?? null,
    agentId: integration?.agentId ?? null,
    eventKey: event.eventKey,
    eventType: event.eventType,
    providerMessageId: event.providerMessageId,
    instagramAccountId: event.accountId,
    igsid: event.senderId,
    payload: event.raw,
  });
  if (!stored) throw new Error("INSTAGRAM_EVENT_PERSISTENCE_FAILED");
  const claimed = await claimInstagramEvent(event.eventKey);
  if (!claimed) return;

  try {
    if (!integration) throw new Error("INSTAGRAM_ACCOUNT_NOT_CONNECTED");
    await updateInstagramIntegration(integration.agentId, { lastWebhookAt: new Date() });
    if (event.isEcho) {
      await completeInstagramEvent(event.eventKey, "ignored");
      await logInstagram({
        agentId: integration.agentId,
        integrationId: integration.id,
        eventType: "echo_ignored",
        providerMessageId: event.providerMessageId,
        message: "Evento is_echo ignorado para impedir loop.",
      });
      return;
    }
    if (event.eventType !== "messages" || !event.senderId) {
      await completeInstagramEvent(event.eventKey, "ignored");
      await logInstagram({
        agentId: integration.agentId,
        integrationId: integration.id,
        eventType: `${event.eventType}_received`,
        providerMessageId: event.providerMessageId,
        message: "Evento Instagram persistido sem acionar o Ravi.",
      });
      return;
    }
    if (!event.providerMessageId) throw new Error("INSTAGRAM_MESSAGE_ID_MISSING");

    let profile: { username?: string; name?: string; profile_pic?: string } = {};
    if (integration.accessTokenEncrypted) {
      try {
        profile = await getInstagramUserProfile(
          event.senderId,
          decryptInstagramToken(integration.accessTokenEncrypted),
        );
      } catch {
        // Perfil é enriquecimento opcional; a mensagem não pode ser perdida.
      }
    }
    const { leadId, conversationId } = await resolveInstagramIdentity({
      agentId: integration.agentId,
      accountId: event.accountId,
      igsid: event.senderId,
      username: profile.username,
      displayName: profile.name || profile.username,
      profilePictureUrl: profile.profile_pic,
      metadata: { source: "instagram_direct" },
      channelMetadata: sanitizedChannelMetadata(event),
    });

    const body = inboundBody(event);
    const existingMessage = await findInstagramMessageByProviderId(event.providerMessageId);
    if (!existingMessage) {
      await appendMessage({
        conversationId,
        channel: "instagram",
        direction: "inbound",
        sender: "lead",
        contentType:
          event.attachmentType === "file"
            ? "document"
            : event.attachmentType && event.attachmentType !== "unknown"
              ? event.attachmentType
              : "text",
        body,
        mediaUrl: event.attachmentUrl,
        providerMessageId: event.providerMessageId,
        providerStatus: "received",
        metadata: sanitizedChannelMetadata(event),
      });
    }
    await updateInstagramIntegration(integration.agentId, {
      lastInboundAt: new Date(),
      lastError: null,
      lastErrorCode: null,
      lastErrorSubcode: null,
      lastErrorAt: null,
    });
    await recordMetric({
      agentId: integration.agentId,
      conversationId,
      eventType: "message_received",
      metadata: { channel: "instagram", eventKey: event.eventKey },
    });
    await logInstagram({
      agentId: integration.agentId,
      integrationId: integration.id,
      conversationId,
      leadId,
      eventType: "message_received",
      providerMessageId: event.providerMessageId,
      message: "Mensagem Instagram recebida, deduplicada e persistida.",
      metadata: { hasReferral: Boolean(event.referral), hasAdsContext: Boolean(event.adsContextData) },
    });

    const agent = await getAgentById(integration.agentId);
    const conversation = await getConversationById(conversationId);
    if (!agent || !conversation) throw new Error("INSTAGRAM_AGENT_OR_CONVERSATION_MISSING");
    if (!conversation.aiPaused && conversation.status !== "human_handoff") {
      if (!event.text && event.attachmentType) {
        await dispatchActions({
          agent,
          conversationId,
          sender: "ai",
          actions: [
            {
              type: "text",
              text: "Recebi seu anexo. Por enquanto, me descreva em texto o que você quer saber para eu te ajudar por aqui.",
            },
          ],
        });
      } else {
        await setConversationPendingProcessAt(conversationId, nextProcessAt(agent));
      }
    }
    await completeInstagramEvent(event.eventKey, "processed");
  } catch (error) {
    const meta = error instanceof MetaInstagramError ? error : null;
    await failInstagramEvent(event.eventKey, {
      message: error instanceof Error ? error.message : "Instagram event processing failed",
      httpStatus: meta?.httpStatus,
      code: meta?.code,
      subcode: meta?.subcode,
    });
    throw error;
  }
}

export async function handleInstagramWebhook(payload: unknown): Promise<void> {
  const events = normalizeInstagramWebhook(payload);
  const failures: unknown[] = [];
  for (const event of events) {
    try {
      await handleEvent(event);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw failures[0];
}

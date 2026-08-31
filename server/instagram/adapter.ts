import type { Agent } from "../../drizzle/schema";
import type { OutboundAction } from "../ai/orchestrator";
import {
  appendMessage,
  getConversationById,
  getLeadById,
  getMediaById,
  recordMetric,
} from "../db";
import { resolvePublicMediaUrl } from "../whatsapp/mediaUrlResolver";
import {
  MetaInstagramError,
  sendInstagramAttachment,
  sendInstagramText,
} from "./client";
import { decryptInstagramToken } from "./crypto";
import {
  getInstagramIdentityForConversation,
  getInstagramIntegrationByAgent,
  logInstagram,
  updateInstagramIntegration,
} from "./db";

export function isInsideInstagramReplyWindow(lastInboundAt: Date | null): boolean {
  return Boolean(lastInboundAt && Date.now() - new Date(lastInboundAt).getTime() <= 24 * 60 * 60 * 1000);
}

export async function dispatchInstagramActions(opts: {
  agent: Agent;
  conversationId: number;
  actions: OutboundAction[];
  sender: "ai" | "human";
}) {
  const { agent, conversationId, actions, sender } = opts;
  const integration = await getInstagramIntegrationByAgent(agent.id);
  const conversation = await getConversationById(conversationId);
  if (!integration?.isConnected || !integration.accessTokenEncrypted || !integration.instagramAccountId) {
    throw new Error("INSTAGRAM_NOT_CONNECTED");
  }
  if (!conversation || conversation.channel !== "instagram") throw new Error("INSTAGRAM_CONVERSATION_INVALID");
  if (!isInsideInstagramReplyWindow(conversation.lastInboundAt)) {
    throw new Error("INSTAGRAM_REPLY_WINDOW_EXPIRED");
  }
  const lead = await getLeadById(conversation.leadId);
  if (!lead) throw new Error("INSTAGRAM_LEAD_NOT_FOUND");
  const identity = await getInstagramIdentityForConversation(
    agent.id,
    lead.id,
    integration.instagramAccountId,
  );
  if (!identity) throw new Error("INSTAGRAM_IDENTITY_NOT_FOUND");
  const accessToken = decryptInstagramToken(integration.accessTokenEncrypted);

  for (const action of actions) {
    const startedAt = Date.now();
    try {
      let result: { message_id: string };
      if (action.type === "text") {
        result = await sendInstagramText(
          integration.instagramAccountId,
          accessToken,
          identity.externalUserId,
          action.text,
        );
        await appendMessage({
          conversationId,
          channel: "instagram",
          direction: "outbound",
          sender,
          contentType: "text",
          body: action.text,
          providerMessageId: result.message_id,
          providerStatus: "sent",
          metadata: { instagramAccountId: integration.instagramAccountId, igsid: identity.externalUserId },
        });
      } else {
        const media = await getMediaById(action.mediaId);
        if (!media) throw new Error("INSTAGRAM_MEDIA_NOT_FOUND");
        const url = await resolvePublicMediaUrl(media.storageUrl, media.storageKey);
        const mediaType = media.mediaType === "document" ? "file" : media.mediaType;
        result = await sendInstagramAttachment(
          integration.instagramAccountId,
          accessToken,
          identity.externalUserId,
          mediaType,
          url,
        );
        await appendMessage({
          conversationId,
          channel: "instagram",
          direction: "outbound",
          sender,
          contentType: media.mediaType,
          body: media.caption,
          mediaUrl: media.storageUrl,
          mediaId: media.id,
          providerMessageId: result.message_id,
          providerStatus: "sent",
          metadata: { instagramAccountId: integration.instagramAccountId, igsid: identity.externalUserId },
        });
      }
      await recordMetric({
        agentId: agent.id,
        conversationId,
        eventType: "message_sent",
        metadata: { channel: "instagram", sender },
      });
      await recordMetric({
        agentId: agent.id,
        conversationId,
        eventType: "response_time_ms",
        valueNumber: Date.now() - startedAt,
        metadata: { channel: "instagram", stage: "meta_send" },
      });
      await updateInstagramIntegration(agent.id, {
        lastOutboundAt: new Date(),
        lastError: null,
        lastErrorCode: null,
        lastErrorSubcode: null,
        lastErrorAt: null,
      });
      await logInstagram({
        agentId: agent.id,
        integrationId: integration.id,
        conversationId,
        leadId: lead.id,
        eventType: "message_sent",
        providerMessageId: result.message_id,
        message: "Mensagem enviada pelo Instagram Adapter.",
        metadata: { sender, actionType: action.type },
      });
    } catch (error) {
      const meta = error instanceof MetaInstagramError ? error : null;
      await appendMessage({
        conversationId,
        channel: "instagram",
        direction: "outbound",
        sender,
        contentType: action.type === "text" ? "text" : "image",
        body: action.type === "text" ? action.text : "[mídia não enviada]",
        providerStatus: "failed",
        metadata: {
          error: error instanceof Error ? error.message.slice(0, 500) : "Instagram send failed",
          retryable: meta?.retryable ?? false,
        },
      });
      await updateInstagramIntegration(agent.id, {
        lastError: error instanceof Error ? error.message.slice(0, 500) : "Instagram send failed",
        lastErrorCode: meta?.code ?? null,
        lastErrorSubcode: meta?.subcode ?? null,
        lastErrorAt: new Date(),
      });
      await recordMetric({
        agentId: agent.id,
        conversationId,
        eventType: "message_failed",
        metadata: { channel: "instagram", code: meta?.code, subcode: meta?.subcode },
      });
      await logInstagram({
        agentId: agent.id,
        integrationId: integration.id,
        conversationId,
        leadId: lead.id,
        eventType: "message_failed",
        level: "error",
        httpStatus: meta?.httpStatus,
        metaErrorCode: meta?.code,
        metaErrorSubcode: meta?.subcode,
        message: error instanceof Error ? error.message : "Instagram send failed",
      });
      throw error;
    }
  }
}

import { sha256 } from "./crypto";

export type NormalizedInstagramEvent = {
  eventKey: string;
  eventType:
    | "messages"
    | "messaging_postbacks"
    | "messaging_referral"
    | "messaging_seen"
    | "message_reactions"
    | "unknown";
  accountId: string;
  senderId: string | null;
  recipientId: string | null;
  providerMessageId: string | null;
  timestamp: number | null;
  isEcho: boolean;
  text: string | null;
  attachmentType: "image" | "video" | "audio" | "file" | "unknown" | null;
  attachmentUrl: string | null;
  referral: Record<string, unknown> | null;
  adsContextData: Record<string, unknown> | null;
  replyTo: Record<string, unknown> | null;
  raw: Record<string, unknown>;
};

function object(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : null;
}

function eventType(item: Record<string, any>): NormalizedInstagramEvent["eventType"] {
  if (object(item.message)) return "messages";
  if (object(item.postback)) return "messaging_postbacks";
  if (object(item.referral)) return "messaging_referral";
  if (object(item.read)) return "messaging_seen";
  if (object(item.reaction)) return "message_reactions";
  return "unknown";
}

function attachmentKind(type: unknown): NormalizedInstagramEvent["attachmentType"] {
  if (type === "image" || type === "video" || type === "audio") return type;
  if (type === "file") return "file";
  return type ? "unknown" : null;
}

export function normalizeInstagramWebhook(payload: unknown): NormalizedInstagramEvent[] {
  const root = object(payload);
  if (!root || root.object !== "instagram" || !Array.isArray(root.entry)) return [];
  const normalized: NormalizedInstagramEvent[] = [];

  for (const entryValue of root.entry) {
    const entry = object(entryValue);
    if (!entry) continue;
    const accountId = String(entry.id || "");
    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
    for (const itemValue of messaging) {
      const item = object(itemValue);
      if (!item) continue;
      const senderId = object(item.sender)?.id ? String(object(item.sender)?.id) : null;
      const recipientId = object(item.recipient)?.id ? String(object(item.recipient)?.id) : null;
      const message = object(item.message);
      const postback = object(item.postback);
      const firstAttachment = Array.isArray(message?.attachments)
        ? object(message?.attachments[0])
        : null;
      const attachmentPayload = object(firstAttachment?.payload);
      const providerMessageId = message?.mid
        ? String(message.mid)
        : postback?.mid
          ? String(postback.mid)
          : null;
      const referral = object(message?.referral) || object(item.referral) || object(postback?.referral);
      const adsContextData =
        object(message?.ads_context_data) || object(attachmentPayload?.ads_context_data);
      const type = eventType(item);
      const eventKey = providerMessageId
        ? `${type}:${providerMessageId}`
        : `${type}:${sha256(JSON.stringify({ accountId, senderId, recipientId, timestamp: item.timestamp, item }))}`;

      normalized.push({
        eventKey,
        eventType: type,
        accountId,
        senderId,
        recipientId,
        providerMessageId,
        timestamp: Number.isFinite(Number(item.timestamp)) ? Number(item.timestamp) : null,
        isEcho: message?.is_echo === true,
        text:
          typeof message?.text === "string"
            ? message.text.trim()
            : typeof postback?.title === "string"
              ? postback.title.trim()
              : typeof postback?.payload === "string"
                ? postback.payload.trim()
                : null,
        attachmentType: attachmentKind(firstAttachment?.type),
        attachmentUrl:
          typeof attachmentPayload?.url === "string" ? attachmentPayload.url : null,
        referral,
        adsContextData,
        replyTo: object(message?.reply_to),
        raw: item,
      });
    }
  }
  return normalized;
}

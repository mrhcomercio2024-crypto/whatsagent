import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { isInsideInstagramReplyWindow } from "./adapter";
import { normalizeInstagramWebhook } from "./parser";

function payload(message: Record<string, unknown>) {
  return {
    object: "instagram",
    entry: [
      {
        id: "17841400000000000",
        messaging: [
          {
            sender: { id: "12345678901234567" },
            recipient: { id: "17841400000000000" },
            timestamp: 1_788_152_400_000,
            message,
          },
        ],
      },
    ],
  };
}

describe("Instagram Webhook normalization", () => {
  it("normalizes a text DM, IGSID, MID, referral, ad data and reply_to", () => {
    const [event] = normalizeInstagramWebhook(
      payload({
        mid: "mid.text.1",
        text: "Boa noite",
        referral: { source: "ADS", ad_id: "ad-123" },
        ads_context_data: { ad_title: "Ravi" },
        reply_to: { mid: "mid.previous" },
      }),
    );
    expect(event).toMatchObject({
      eventKey: "messages:mid.text.1",
      eventType: "messages",
      accountId: "17841400000000000",
      senderId: "12345678901234567",
      providerMessageId: "mid.text.1",
      text: "Boa noite",
      isEcho: false,
      referral: { source: "ADS", ad_id: "ad-123" },
      adsContextData: { ad_title: "Ravi" },
      replyTo: { mid: "mid.previous" },
    });
  });

  it("normalizes attachments without breaking the MVP", () => {
    const [event] = normalizeInstagramWebhook(
      payload({
        mid: "mid.image.1",
        attachments: [{ type: "image", payload: { url: "https://cdn.example/image.jpg" } }],
      }),
    );
    expect(event.attachmentType).toBe("image");
    expect(event.attachmentUrl).toBe("https://cdn.example/image.jpg");
    expect(event.text).toBeNull();
  });

  it("marks echo and preserves the same key on repeated delivery", () => {
    const duplicate = payload({ mid: "mid.duplicate", text: "eco", is_echo: true });
    const first = normalizeInstagramWebhook(duplicate)[0];
    const second = normalizeInstagramWebhook(duplicate)[0];
    expect(first.isEcho).toBe(true);
    expect(first.eventKey).toBe(second.eventKey);
  });

  it("keeps five sequential DMs ordered and independently idempotent", () => {
    const messages = [
      "Boa noite",
      "quero entender como funciona",
      "qual é o investimento?",
      "posso vender na Shopee?",
      "quero o link",
    ];
    const normalized = messages.flatMap((text, index) =>
      normalizeInstagramWebhook(payload({ mid: `mid.context.${index + 1}`, text })),
    );
    expect(normalized.map(event => event.text)).toEqual(messages);
    expect(new Set(normalized.map(event => event.eventKey)).size).toBe(5);
  });

  it("ignores payloads from other Meta objects", () => {
    expect(normalizeInstagramWebhook({ object: "page", entry: [] })).toEqual([]);
  });
});

describe("Instagram routing contracts", () => {
  it("enforces the 24 hour user-initiated reply window", () => {
    expect(isInsideInstagramReplyWindow(new Date(Date.now() - 23 * 60 * 60 * 1000))).toBe(true);
    expect(isInsideInstagramReplyWindow(new Date(Date.now() - 25 * 60 * 60 * 1000))).toBe(false);
    expect(isInsideInstagramReplyWindow(null)).toBe(false);
  });

  it("routes Instagram conversations before WhatsApp connectionMode", () => {
    const source = readFileSync(new URL("../whatsapp/dispatcher.ts", import.meta.url), "utf8");
    const instagramBranch = source.indexOf('conversation?.channel === "instagram"');
    const whatsappBranch = source.indexOf('opts.agent.connectionMode === "qr"');
    expect(instagramBranch).toBeGreaterThan(0);
    expect(instagramBranch).toBeLessThan(whatsappBranch);
  });
});

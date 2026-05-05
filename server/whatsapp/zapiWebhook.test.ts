import { describe, it, expect } from "vitest";
import { extractInboundContent, verifyWebhookSecret } from "./zapi";

describe("zapi webhook parsing", () => {
  it("ignora payloads de mensagens enviadas por mim (fromMe=true)", () => {
    const out = extractInboundContent({
      phone: "5511999990000",
      fromMe: true,
      isGroup: false,
      text: { message: "ignore-me" },
    } as any);
    expect(out).toBeNull();
  });

  it("ignora grupos", () => {
    const out = extractInboundContent({
      phone: "5511999990000",
      fromMe: false,
      isGroup: true,
      text: { message: "group-msg" },
    } as any);
    expect(out).toBeNull();
  });

  it("extrai texto simples", () => {
    const out = extractInboundContent({
      phone: "5511999990000",
      fromMe: false,
      isGroup: false,
      text: { message: "olá" },
    } as any);
    expect(out).toEqual({ text: "olá" });
  });

  it("extrai imagem com caption", () => {
    const out = extractInboundContent({
      phone: "5511999990000",
      fromMe: false,
      isGroup: false,
      image: { imageUrl: "https://x/i.jpg", caption: "veja", mimeType: "image/jpeg" },
    } as any);
    expect(out).toMatchObject({
      mediaUrl: "https://x/i.jpg",
      mediaType: "image",
      text: "veja",
    });
  });

  it("extrai documento com fileName", () => {
    const out = extractInboundContent({
      phone: "5511999990000",
      fromMe: false,
      isGroup: false,
      document: {
        documentUrl: "https://x/doc.pdf",
        fileName: "doc.pdf",
        mimeType: "application/pdf",
      },
    } as any);
    expect(out).toMatchObject({
      mediaUrl: "https://x/doc.pdf",
      mediaType: "document",
      fileName: "doc.pdf",
    });
  });
});

describe("verifyWebhookSecret", () => {
  it("aceita match exato", () => {
    expect(verifyWebhookSecret("abc123", "abc123")).toBe(true);
  });

  it("rejeita mismatch", () => {
    expect(verifyWebhookSecret("abc123", "wrong")).toBe(false);
  });

  it("rejeita ausência", () => {
    expect(verifyWebhookSecret("abc123", undefined)).toBe(false);
    expect(verifyWebhookSecret(null, "abc123")).toBe(false);
    expect(verifyWebhookSecret("", "abc123")).toBe(false);
  });

  it("aceita primeiro item quando vier array (query string repetida)", () => {
    expect(verifyWebhookSecret("abc123", ["abc123"])).toBe(true);
    expect(verifyWebhookSecret("abc123", ["wrong", "abc123"])).toBe(false);
  });
});

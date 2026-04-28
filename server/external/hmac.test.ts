import { describe, expect, it } from "vitest";
import { computeSignature, generateSecret, verifySignature } from "./hmac";

describe("HMAC SHA-256", () => {
  it("computa hex determinístico", () => {
    const sig = computeSignature("topsecret", "hello");
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
    expect(computeSignature("topsecret", "hello")).toBe(sig);
  });

  it("aceita assinatura hex pura", () => {
    const body = JSON.stringify({ ok: 1 });
    const sig = computeSignature("k", body);
    expect(verifySignature("k", body, sig)).toBe(true);
  });

  it("aceita prefixo sha256=", () => {
    const body = "abc";
    const sig = "sha256=" + computeSignature("k", body);
    expect(verifySignature("k", body, sig)).toBe(true);
  });

  it("aceita formato Stripe t=,v1=", () => {
    const body = "abc";
    const v1 = computeSignature("k", body);
    expect(verifySignature("k", body, `t=12345,v1=${v1}`)).toBe(true);
  });

  it("rejeita assinatura inválida", () => {
    expect(verifySignature("k", "abc", "0".repeat(64))).toBe(false);
    expect(verifySignature("k", "abc", null)).toBe(false);
    expect(verifySignature("k", "abc", "")).toBe(false);
  });

  it("rejeita corpo modificado", () => {
    const sig = computeSignature("k", "original");
    expect(verifySignature("k", "modificado", sig)).toBe(false);
  });

  it("aceita qualquer assinatura quando secret é null (modo aberto)", () => {
    expect(verifySignature(null, "abc", null)).toBe(true);
    expect(verifySignature(undefined, "abc", "qualquer")).toBe(true);
  });

  it("generateSecret produz 64 chars hex", () => {
    const s = generateSecret();
    expect(s).toMatch(/^[a-f0-9]{64}$/);
    expect(generateSecret()).not.toBe(s);
  });
});

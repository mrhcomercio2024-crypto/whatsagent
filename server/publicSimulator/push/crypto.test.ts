import { describe, expect, it } from "vitest";
import { createPushEventToken, decryptPushSecret, encryptPushSecret, hashPushEndpoint, verifyPushEventToken } from "./crypto";

describe("push secret protection", () => {
  it("encrypts endpoint/key material using authenticated encryption", () => {
    const secret = "https://updates.push.services.mozilla.com/wpush/v2/example";
    const encrypted = encryptPushSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(encrypted.startsWith("v1:")).toBe(true);
    expect(decryptPushSecret(encrypted)).toBe(secret);
  });

  it("uses a deterministic endpoint hash without persisting plaintext", () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/example";
    expect(hashPushEndpoint(endpoint)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashPushEndpoint(endpoint)).toBe(hashPushEndpoint(endpoint));
  });

  it("signs browser tracking events per push_id", () => {
    const token = createPushEventToken("push-123");
    expect(verifyPushEventToken("push-123", token)).toBe(true);
    expect(verifyPushEventToken("push-456", token)).toBe(false);
  });
});

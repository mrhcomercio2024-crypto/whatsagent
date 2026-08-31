import { describe, expect, it } from "vitest";
import webpush from "web-push";

describe("Web Push environment", () => {
  it("accepts the configured VAPID credentials", () => {
    const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    const subject = process.env.WEB_PUSH_VAPID_SUBJECT;

    expect(publicKey).toMatch(/^[A-Za-z0-9_-]{80,100}$/);
    expect(privateKey).toMatch(/^[A-Za-z0-9_-]{40,60}$/);
    expect(subject).toBe("mailto:marcelo@wedrop.com.br");
    expect(() => webpush.setVapidDetails(subject!, publicKey!, privateKey!)).not.toThrow();
  });

  it("has a valid 256-bit subscription encryption key", () => {
    const key = process.env.WEB_PUSH_ENCRYPTION_KEY;
    expect(key).toMatch(/^[a-f0-9]{64}$/i);
    expect(Buffer.from(key!, "hex")).toHaveLength(32);
  });
});

import { createHmac } from "crypto";
import { readFileSync } from "fs";
import { describe, expect, it, vi } from "vitest";
import {
  INSTAGRAM_CALLBACK_URL,
  INSTAGRAM_META_APP_ID,
  INSTAGRAM_OAUTH_REDIRECT_URI,
  INSTAGRAM_SCOPES,
  instagramEnv,
} from "./config";
import { buildInstagramAuthorizationUrl } from "./client";
import { safeEqual, verifyMetaSignature } from "./crypto";
import { __instagramOauthTest } from "./oauth";
import {
  allowInstagramWebhookRequest,
  resetInstagramWebhookRateLimitForTests,
} from "./webhook";

describe("Instagram security contracts", () => {
  it("uses only the authorized Meta App and exact production URLs", () => {
    expect(INSTAGRAM_META_APP_ID).toBe("2533423037090142");
    expect(INSTAGRAM_CALLBACK_URL).toBe("https://agentedozap.com/webhooks/meta/instagram");
    expect(INSTAGRAM_OAUTH_REDIRECT_URI).toBe(
      "https://agentedozap.com/api/instagram/oauth/callback",
    );
  });

  it("builds Instagram Login with current scopes and state", () => {
    const url = new URL(buildInstagramAuthorizationUrl("signed-state"));
    expect(url.origin).toBe("https://www.instagram.com");
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe(INSTAGRAM_META_APP_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(INSTAGRAM_OAUTH_REDIRECT_URI);
    expect(url.searchParams.get("scope")?.split(",")).toEqual([...INSTAGRAM_SCOPES]);
    expect(url.searchParams.get("state")).toBe("signed-state");
  });

  it("accepts only the exact valid X-Hub-Signature-256", () => {
    const body = Buffer.from(JSON.stringify({ object: "instagram", entry: [] }));
    const secret = "meta-app-secret-for-test";
    const digest = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyMetaSignature(secret, body, `sha256=${digest}`)).toBe(true);
    expect(verifyMetaSignature(secret, Buffer.from("tampered"), `sha256=${digest}`)).toBe(false);
    expect(verifyMetaSignature(secret, body, undefined)).toBe(false);
    expect(safeEqual("same", "same")).toBe(true);
    expect(safeEqual("same", "different")).toBe(false);
  });

  it("rejects any Meta App ID other than Dashboard Marcelo", () => {
    vi.stubEnv("META_APP_ID", "999999999");
    expect(() => instagramEnv()).toThrow("META_APP_ID_INVALID");
    vi.unstubAllEnvs();
  });

  it("registers the Instagram raw-body Webhook before express.json", () => {
    const source = readFileSync(new URL("../_core/index.ts", import.meta.url), "utf8");
    expect(source.indexOf("registerInstagramWebhookRoutes(app)")).toBeGreaterThan(0);
    expect(source.indexOf("registerInstagramWebhookRoutes(app)")).toBeLessThan(
      source.indexOf("app.use(express.json"),
    );
  });

  it("signs OAuth state, rejects tampering and enforces expiry", () => {
    const valid = __instagramOauthTest.encodeState({
      nonce: "nonce",
      agentId: 1,
      userId: 1,
      exp: Date.now() + 60_000,
    });
    expect(__instagramOauthTest.decodeState(valid)).toMatchObject({ agentId: 1, userId: 1 });
    expect(() => __instagramOauthTest.decodeState(`${valid}tampered`)).toThrow();
    const expired = __instagramOauthTest.encodeState({
      nonce: "nonce",
      agentId: 1,
      userId: 1,
      exp: Date.now() - 1,
    });
    expect(() => __instagramOauthTest.decodeState(expired)).toThrow("INSTAGRAM_OAUTH_STATE_EXPIRED");
  });

  it("rate limits bursts without blocking normal Meta batches", () => {
    resetInstagramWebhookRateLimitForTests();
    for (let attempt = 0; attempt < 1_000; attempt += 1) {
      expect(allowInstagramWebhookRequest("meta-ip", 100)).toBe(true);
    }
    expect(allowInstagramWebhookRequest("meta-ip", 100)).toBe(false);
    expect(allowInstagramWebhookRequest("meta-ip", 60_101)).toBe(true);
  });

  it("never exposes accessTokenEncrypted in the public Instagram status DTO", () => {
    const source = readFileSync(new URL("./router.ts", import.meta.url), "utf8");
    const statusBody = source.slice(source.indexOf("function publicStatus"), source.indexOf("export const instagramRouter"));
    expect(statusBody).not.toContain("accessTokenEncrypted:");
    expect(statusBody).not.toContain("appSecret");
    expect(statusBody).not.toContain("verifyToken");
  });
});

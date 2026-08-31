import type { Express, Request, Response } from "express";
import { randomBytes } from "crypto";
import {
  buildInstagramAuthorizationUrl,
  exchangeInstagramCode,
  exchangeLongLivedInstagramToken,
  getInstagramProfile,
  subscribeInstagramWebhooks,
} from "./client";
import {
  INSTAGRAM_ADMIN_REDIRECT,
  INSTAGRAM_META_APP_ID,
  INSTAGRAM_SCOPES,
  instagramEnv,
} from "./config";
import { encryptInstagramToken, hmacSha256, safeEqual, sha256 } from "./crypto";
import {
  consumeInstagramOauthState,
  createInstagramOauthState,
  ensureInstagramIntegration,
  logInstagram,
  updateInstagramIntegration,
} from "./db";

type OAuthStatePayload = { nonce: string; agentId: number; userId: number; exp: number };

function signState(payload: string): string {
  const secret = process.env.JWT_SECRET || "";
  if (secret.length < 16) throw new Error("JWT_SECRET_MISSING");
  return hmacSha256(secret, `instagram-oauth:${payload}`);
}

function encodeState(input: OAuthStatePayload): string {
  const payload = Buffer.from(JSON.stringify(input)).toString("base64url");
  return `${payload}.${signState(payload)}`;
}

function decodeState(state: string): OAuthStatePayload {
  const [payload, signature] = state.split(".");
  if (!payload || !signature || !safeEqual(signState(payload), signature)) {
    throw new Error("INSTAGRAM_OAUTH_STATE_SIGNATURE_INVALID");
  }
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthStatePayload;
  if (!parsed.nonce || !Number.isInteger(parsed.agentId) || !Number.isInteger(parsed.userId)) {
    throw new Error("INSTAGRAM_OAUTH_STATE_INVALID");
  }
  if (parsed.exp <= Date.now()) throw new Error("INSTAGRAM_OAUTH_STATE_EXPIRED");
  return parsed;
}

export async function createInstagramConnectUrl(agentId: number, userId: number) {
  instagramEnv();
  await ensureInstagramIntegration(agentId, INSTAGRAM_META_APP_ID);
  const exp = Date.now() + 10 * 60 * 1000;
  const state = encodeState({
    nonce: randomBytes(24).toString("base64url"),
    agentId,
    userId,
    exp,
  });
  await createInstagramOauthState({
    stateHash: sha256(state),
    agentId,
    userId,
    redirectOrigin: INSTAGRAM_ADMIN_REDIRECT,
    expiresAt: new Date(exp),
  });
  return buildInstagramAuthorizationUrl(state);
}

async function handleInstagramOauthCallback(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const providerError = typeof req.query.error === "string" ? req.query.error : "";
  let redirect = INSTAGRAM_ADMIN_REDIRECT;

  try {
    if (providerError) throw new Error("INSTAGRAM_OAUTH_DENIED");
    if (!state || !code) throw new Error("INSTAGRAM_OAUTH_CALLBACK_INCOMPLETE");
    const decoded = decodeState(state);
    const stored = await consumeInstagramOauthState(sha256(state));
    if (!stored) throw new Error("INSTAGRAM_OAUTH_STATE_USED_OR_EXPIRED");
    if (stored.agentId !== decoded.agentId || stored.userId !== decoded.userId) {
      throw new Error("INSTAGRAM_OAUTH_STATE_MISMATCH");
    }
    redirect = stored.redirectOrigin;

    const shortToken = await exchangeInstagramCode(code);
    const longToken = await exchangeLongLivedInstagramToken(shortToken.access_token);
    const profile = await getInstagramProfile(longToken.access_token);
    const accountId = String(profile.user_id || profile.id || shortToken.user_id || "");
    if (!accountId) throw new Error("INSTAGRAM_ACCOUNT_ID_MISSING");
    const subscribedFields = await subscribeInstagramWebhooks(accountId, longToken.access_token);
    const expiresAt = new Date(Date.now() + Math.max(0, longToken.expires_in) * 1000);

    const integration = await updateInstagramIntegration(decoded.agentId, {
      metaAppId: INSTAGRAM_META_APP_ID,
      instagramAccountId: accountId,
      username: profile.username ?? null,
      accountName: profile.name ?? null,
      profilePictureUrl: profile.profile_picture_url ?? null,
      accessTokenEncrypted: encryptInstagramToken(longToken.access_token),
      tokenExpiresAt: expiresAt,
      tokenStatus: "valid",
      scopes: [...INSTAGRAM_SCOPES],
      webhookStatus: "subscribed",
      webhookSubscribedAt: new Date(),
      lastSyncAt: new Date(),
      lastError: null,
      lastErrorCode: null,
      lastErrorSubcode: null,
      lastErrorAt: null,
      isConnected: true,
    });
    await logInstagram({
      agentId: decoded.agentId,
      integrationId: integration?.id ?? null,
      eventType: "oauth_connected",
      message: "Conta profissional Instagram conectada via OAuth.",
      metadata: { accountId, username: profile.username, subscribedFields, tokenExpiresAt: expiresAt },
    });
    res.redirect(303, `${redirect}?instagram=connected`);
  } catch (error) {
    const codeValue = error instanceof Error ? error.message : "INSTAGRAM_OAUTH_UNKNOWN";
    await logInstagram({
      eventType: "oauth_failed",
      level: "error",
      message: codeValue,
    });
    res.redirect(303, `${redirect}?instagram=error&code=${encodeURIComponent(codeValue)}`);
  }
}

export function registerInstagramOauthRoutes(app: Express) {
  app.get("/api/instagram/oauth/callback", (req, res) => {
    void handleInstagramOauthCallback(req, res);
  });
}

export const __instagramOauthTest = { encodeState, decodeState };

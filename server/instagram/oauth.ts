import type { Express, Request, Response } from "express";
import { randomBytes } from "crypto";
import {
  buildFacebookAuthorizationUrl,
  discoverFacebookInstagramAssets,
  exchangeFacebookCode,
  exchangeLongLivedFacebookToken,
  subscribeInstagramWebhooks,
  type FacebookInstagramAsset,
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
  return buildFacebookAuthorizationUrl(state);
}

export async function finalizeFacebookInstagramAsset(
  agentId: number,
  asset: FacebookInstagramAsset,
) {
  const subscribedFields = await subscribeInstagramWebhooks(
    asset.pageId,
    asset.pageAccessToken,
  );
  const integration = await updateInstagramIntegration(agentId, {
    metaAppId: INSTAGRAM_META_APP_ID,
    oauthProvider: "facebook",
    facebookPageId: asset.pageId,
    facebookPageName: asset.pageName,
    instagramAccountId: asset.instagramAccountId,
    username: asset.instagramUsername ?? null,
    accountName: asset.instagramName ?? null,
    profilePictureUrl: asset.profilePictureUrl ?? null,
    accessTokenEncrypted: encryptInstagramToken(asset.pageAccessToken),
    pendingAssetsEncrypted: null,
    tokenExpiresAt: null,
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
    agentId,
    integrationId: integration?.id ?? null,
    eventType: "oauth_connected",
    message: "Conta profissional Instagram conectada via Facebook Login for Business.",
    metadata: {
      pageId: asset.pageId,
      instagramAccountId: asset.instagramAccountId,
      username: asset.instagramUsername,
      subscribedFields,
    },
  });
  return integration;
}

async function handleInstagramOauthCallback(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const providerError = typeof req.query.error === "string" ? req.query.error : "";
  let redirect = INSTAGRAM_ADMIN_REDIRECT;
  let agentIdForLog: number | null = null;

  try {
    if (providerError) throw new Error("INSTAGRAM_OAUTH_DENIED");
    if (!state || !code) throw new Error("INSTAGRAM_OAUTH_CALLBACK_INCOMPLETE");
    const decoded = decodeState(state);
    agentIdForLog = decoded.agentId;
    const stored = await consumeInstagramOauthState(sha256(state));
    if (!stored) throw new Error("INSTAGRAM_OAUTH_STATE_USED_OR_EXPIRED");
    if (stored.agentId !== decoded.agentId || stored.userId !== decoded.userId) {
      throw new Error("INSTAGRAM_OAUTH_STATE_MISMATCH");
    }
    redirect = stored.redirectOrigin;

    const shortToken = await exchangeFacebookCode(code);
    const longToken = await exchangeLongLivedFacebookToken(shortToken.access_token);
    const assets = await discoverFacebookInstagramAssets(longToken.access_token);
    if (assets.length === 0) throw new Error("INSTAGRAM_FACEBOOK_ASSET_NOT_FOUND");
    if (assets.length > 1) {
      const integration = await updateInstagramIntegration(decoded.agentId, {
        oauthProvider: "facebook",
        pendingAssetsEncrypted: encryptInstagramToken(JSON.stringify(assets)),
        lastError: "Selecione a Página e a conta profissional do Instagram no painel.",
        lastErrorCode: "INSTAGRAM_ASSET_SELECTION_REQUIRED",
        lastErrorAt: new Date(),
      });
      await logInstagram({
        agentId: decoded.agentId,
        integrationId: integration?.id ?? null,
        eventType: "oauth_asset_selection_required",
        message: "Mais de uma conta profissional Instagram foi autorizada.",
        metadata: { assetCount: assets.length },
      });
      res.redirect(303, `${redirect}?instagram=select`);
      return;
    }
    await finalizeFacebookInstagramAsset(decoded.agentId, assets[0]);
    res.redirect(303, `${redirect}?instagram=connected`);
  } catch (error) {
    const codeValue = error instanceof Error ? error.message : "INSTAGRAM_OAUTH_UNKNOWN";
    await logInstagram({
      agentId: agentIdForLog,
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

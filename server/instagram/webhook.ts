import express, { type Express, type Request, type Response } from "express";
import { instagramEnv } from "./config";
import { safeEqual, verifyMetaSignature } from "./crypto";
import { logInstagram } from "./db";

const webhookRateBuckets = new Map<string, { count: number; resetAt: number }>();

export function allowInstagramWebhookRequest(identifier: string, now = Date.now()): boolean {
  const key = identifier || "unknown";
  const current = webhookRateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    webhookRateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  current.count += 1;
  if (webhookRateBuckets.size > 2_000) {
    webhookRateBuckets.forEach((bucket, bucketKey) => {
      if (bucket.resetAt <= now) webhookRateBuckets.delete(bucketKey);
    });
  }
  return current.count <= 1_000;
}

export function resetInstagramWebhookRateLimitForTests() {
  webhookRateBuckets.clear();
}

async function verifyWebhook(req: Request, res: Response) {
  const mode = String(req.query["hub.mode"] || "");
  const token = String(req.query["hub.verify_token"] || "");
  const challenge = String(req.query["hub.challenge"] || "");
  const { verifyToken } = instagramEnv();
  if (mode !== "subscribe" || !token || !safeEqual(token, verifyToken)) {
    res.status(403).send("Forbidden");
    return;
  }
  await logInstagram({
    eventType: "webhook_verified",
    message: "Callback Instagram verificado pela Meta.",
  });
  res.status(200).send(challenge);
}

async function receiveWebhook(req: Request, res: Response) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const signature = req.header("x-hub-signature-256") || undefined;
  const { appSecret } = instagramEnv();
  if (!rawBody.length || !verifyMetaSignature(appSecret, rawBody, signature)) {
    res.status(401).json({ ok: false });
    return;
  }
  if (!allowInstagramWebhookRequest(req.ip || req.socket.remoteAddress || "unknown")) {
    res.status(429).json({ ok: false });
    return;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ ok: false });
    return;
  }

  const { handleInstagramWebhook } = await import("./service");
  try {
    await handleInstagramWebhook(payload);
    res.status(200).json({ ok: true });
  } catch (error) {
    await logInstagram({
      eventType: "webhook_processing_failed",
      level: "error",
      message: error instanceof Error ? error.message : "Instagram webhook processing failed",
    });
    res.status(200).json({ ok: true });
  }
}

export function registerInstagramWebhookRoutes(app: Express) {
  app.get("/webhooks/meta/instagram", (req, res) => void verifyWebhook(req, res));
  app.post(
    "/webhooks/meta/instagram",
    express.raw({ type: "application/json", limit: "2mb" }),
    (req, res) => void receiveWebhook(req, res),
  );
}

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

function encryptionKey(): Buffer {
  const raw = process.env.WEB_PUSH_ENCRYPTION_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(raw)) throw new Error("WEB_PUSH_ENCRYPTION_KEY_INVALID");
  return Buffer.from(raw, "hex");
}

export function hashPushEndpoint(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

export function encryptPushSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptPushSecret(payload: string): string {
  const [version, ivRaw, tagRaw, encryptedRaw] = payload.split(":");
  if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("PUSH_SECRET_PAYLOAD_INVALID");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function createPushEventToken(pushId: string): string {
  return createHmac("sha256", encryptionKey()).update(`push-event:${pushId}`).digest("base64url");
}

export function verifyPushEventToken(pushId: string, token: string): boolean {
  if (!pushId || !token) return false;
  const expected = Buffer.from(createPushEventToken(pushId));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function getPublicVapidKey(): string | null {
  const value = process.env.WEB_PUSH_VAPID_PUBLIC_KEY || "";
  return /^[A-Za-z0-9_-]{80,100}$/.test(value) ? value : null;
}

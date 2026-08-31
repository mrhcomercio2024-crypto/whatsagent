import { createHash, createHmac, timingSafeEqual } from "crypto";
import {
  decryptPushSecret,
  encryptPushSecret,
} from "../publicSimulator/push/crypto";

export function encryptInstagramToken(token: string): string {
  return encryptPushSecret(token);
}

export function decryptInstagramToken(payload: string): string {
  return decryptPushSecret(payload);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacSha256(secret: string, value: string | Buffer): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyMetaSignature(
  appSecret: string,
  rawBody: Buffer,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const provided = signatureHeader.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(provided)) return false;
  return safeEqual(hmacSha256(appSecret, rawBody), provided.toLowerCase());
}

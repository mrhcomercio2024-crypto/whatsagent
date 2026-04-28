/**
 * Validação de assinatura HMAC SHA-256 para webhooks externos.
 * Aceita o header em diferentes formatos comuns:
 *   - "abc123..."        (hex puro)
 *   - "sha256=abc123..." (formato GitHub/Stripe-like)
 *   - "t=...,v1=..."     (Stripe completo) — extrai apenas v1
 */
import crypto from "node:crypto";

export function computeSignature(secret: string, rawBody: string | Buffer): string {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

function extractHex(header: string): string {
  const trimmed = header.trim();
  if (trimmed.startsWith("sha256=")) return trimmed.slice("sha256=".length).trim();
  // Stripe-like t=...,v1=...
  const v1 = trimmed.split(",").find((p) => p.trim().startsWith("v1="));
  if (v1) return v1.trim().slice("v1=".length).trim();
  return trimmed;
}

/**
 * Compara em tempo constante para evitar timing attacks.
 * Retorna true se a assinatura confere com `secret + rawBody`.
 */
export function verifySignature(
  secret: string | null | undefined,
  rawBody: string | Buffer,
  headerValue: string | null | undefined
): boolean {
  if (!secret) return true; // sem secret configurado, aceita qualquer payload (modo aberto)
  if (!headerValue) return false;
  const expected = computeSignature(secret, rawBody);
  const provided = extractHex(headerValue).toLowerCase();
  if (provided.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(provided, "utf8")
    );
  } catch {
    return false;
  }
}

/** Gera secret aleatório de 32 bytes (64 chars hex). */
export function generateSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

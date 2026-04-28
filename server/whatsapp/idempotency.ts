/**
 * Trava de idempotência para envios outbound:
 * impede que a mesma mensagem (mesmo texto OU mesma mídia) seja
 * disparada para a mesma conversa duas vezes em uma janela curta.
 *
 * Camadas:
 *  1) Cache in-memory (instantâneo, escopo do processo).
 *  2) Verificação no banco contra a última outbound da conversa.
 *
 * Uso típico no dispatcher: chamar `wasRecentlySent(conv, key)`
 * antes de enviar; se true, descarta com log e marca como duplicado.
 */
import { createHash } from "node:crypto";

interface SentEntry {
  hash: string;
  at: number;
}

const recent = new Map<number, SentEntry[]>(); // conversationId → entries
const DEFAULT_WINDOW_MS = 90_000;
const MAX_ENTRIES_PER_CONV = 20;

export function buildOutboundKey(action: {
  type: "text" | "media";
  text?: string;
  mediaId?: number;
  caption?: string;
}): string {
  const norm =
    action.type === "text"
      ? `text|${(action.text ?? "").trim().toLowerCase().replace(/\s+/g, " ")}`
      : `media|${action.mediaId ?? 0}|${(action.caption ?? "").trim().toLowerCase()}`;
  return createHash("sha1").update(norm).digest("hex").slice(0, 24);
}

export function wasRecentlySent(
  conversationId: number,
  hash: string,
  windowMs = DEFAULT_WINDOW_MS,
  now: number = Date.now()
): boolean {
  const entries = recent.get(conversationId);
  if (!entries) return false;
  const cutoff = now - windowMs;
  for (const e of entries) {
    if (e.at >= cutoff && e.hash === hash) return true;
  }
  return false;
}

export function markSent(
  conversationId: number,
  hash: string,
  now: number = Date.now()
): void {
  let entries = recent.get(conversationId);
  if (!entries) {
    entries = [];
    recent.set(conversationId, entries);
  }
  entries.push({ hash, at: now });
  // prune por tamanho
  if (entries.length > MAX_ENTRIES_PER_CONV) {
    entries.splice(0, entries.length - MAX_ENTRIES_PER_CONV);
  }
}

export function pruneOlderThan(maxAgeMs: number, now: number = Date.now()): void {
  const cutoff = now - maxAgeMs;
  for (const [conv, entries] of Array.from(recent.entries())) {
    const filtered = entries.filter(e => e.at >= cutoff);
    if (filtered.length === 0) recent.delete(conv);
    else recent.set(conv, filtered);
  }
}

export function _resetForTests(): void {
  recent.clear();
}

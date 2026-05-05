/**
 * Política de envio de mídia:
 *  - NUNCA enviar a mesma mediaId 2x na mesma conversa (idempotência).
 *  - Cooldown de 60s desde a última mídia outbound: se a IA tentar enviar
 *    outra mídia muito perto, segura para o próximo turno.
 */

import type { Message as DbMessage } from "../../drizzle/schema";

export const DEFAULT_MEDIA_COOLDOWN_MS = 60_000;

export function lastOutboundMediaTimestamp(
  history: DbMessage[] | undefined
): number | null {
  if (!history || history.length === 0) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.direction !== "outbound") continue;
    if (m.contentType === "text") continue;
    if (!m.contentType) continue;
    const ts = m.createdAt
      ? new Date(m.createdAt as unknown as string | Date).getTime()
      : null;
    if (ts) return ts;
  }
  return null;
}

export function isMediaOnCooldown(opts: {
  history: DbMessage[] | undefined;
  now?: number;
  cooldownMs?: number;
}): boolean {
  const cd = opts.cooldownMs ?? DEFAULT_MEDIA_COOLDOWN_MS;
  const now = opts.now ?? Date.now();
  const last = lastOutboundMediaTimestamp(opts.history);
  if (!last) return false;
  return now - last < cd;
}

/**
 * Filtra mídias propostas (por gatilho ou pela LLM) aplicando:
 *  1. Idempotência: remove ids já presentes em `alreadySentIds`.
 *  2. Cooldown: se houver mídia outbound recente, mantém apenas a 1ª da rajada
 *     e descarta as demais.
 *  3. Limite duro: no máximo 1 mídia nova por turno (evita spam).
 */
export function filterMediaForTurn(opts: {
  proposedIds: number[];
  alreadySentIds: number[];
  history: DbMessage[] | undefined;
  now?: number;
  cooldownMs?: number;
}): { allowed: number[]; dropped: Array<{ id: number; reason: string }> } {
  const allowed: number[] = [];
  const dropped: Array<{ id: number; reason: string }> = [];
  const seen = new Set<number>();
  const onCooldown = isMediaOnCooldown({
    history: opts.history,
    now: opts.now,
    cooldownMs: opts.cooldownMs,
  });

  for (const id of opts.proposedIds) {
    if (seen.has(id)) {
      dropped.push({ id, reason: "duplicate-in-turn" });
      continue;
    }
    seen.add(id);
    if (opts.alreadySentIds.includes(id)) {
      dropped.push({ id, reason: "already-sent" });
      continue;
    }
    if (onCooldown) {
      dropped.push({ id, reason: "cooldown" });
      continue;
    }
    if (allowed.length >= 1) {
      // Limite: 1 mídia por turno
      dropped.push({ id, reason: "max-1-per-turn" });
      continue;
    }
    allowed.push(id);
  }

  return { allowed, dropped };
}

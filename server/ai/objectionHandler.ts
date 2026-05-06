/**
 * server/ai/objectionHandler.ts
 *
 * Detecta objeção no inbound do lead e devolve a melhor resposta + mídias.
 *
 * Fluxo:
 *   1. Recebe texto do lead + agentId + conversationId
 *   2. Busca objeções ativas do agente (cache em memória 60s)
 *   3. Aplica casamento por keyword + regex
 *   4. Filtra as que já foram disparadas se sendOncePerConversation=true
 *   5. Retorna a de menor priority (vence em caso de empate)
 *   6. Se literalResponse=true, o orchestrator dispara direto sem LLM.
 *      Senão, retorna como hint pro prompt.
 */

import { getDb } from "../db";
import { objections, objectionDispatches } from "../../drizzle/schema";
import { and, eq, asc } from "drizzle-orm";

// ════════════════════════════════════════════════════════════
// Cache em memória (TTL 60s) pra não bater no banco em todo turno
// ════════════════════════════════════════════════════════════
type CachedObjections = { items: ObjectionRow[]; expiresAt: number };
const cache = new Map<number, CachedObjections>();
const CACHE_TTL_MS = 60_000;

export type ObjectionRow = {
  id: number;
  name: string;
  triggerKeywords: string[];
  triggerRegex: RegExp[];
  responseTemplate: string;
  literalResponse: boolean;
  mediaIds: number[];
  nextStepAction: "stay" | "advance" | "restart";
  priority: number;
  sendOncePerConversation: boolean;
};

async function loadObjections(agentId: number): Promise<ObjectionRow[]> {
  const now = Date.now();
  const cached = cache.get(agentId);
  if (cached && cached.expiresAt > now) return cached.items;

  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(objections)
    .where(and(eq(objections.agentId, agentId), eq(objections.isActive, true)))
    .orderBy(asc(objections.priority));

  const items: ObjectionRow[] = rows.map(r => ({
    id: r.id,
    name: r.name,
    triggerKeywords: parseJsonArray(r.triggerKeywords).map(s => normalize(String(s))).filter(Boolean),
    triggerRegex: parseJsonArray(r.triggerRegex || "[]")
      .map(s => safeRegex(String(s)))
      .filter(Boolean) as RegExp[],
    responseTemplate: r.responseTemplate,
    literalResponse: !!r.literalResponse,
    mediaIds: parseJsonArray(r.mediaIds || "[]")
      .map(n => Number(n))
      .filter(n => !Number.isNaN(n) && n > 0),
    nextStepAction: r.nextStepAction,
    priority: r.priority,
    sendOncePerConversation: !!r.sendOncePerConversation,
  }));

  cache.set(agentId, { items, expiresAt: now + CACHE_TTL_MS });
  return items;
}

export function invalidateObjectionsCache(agentId?: number) {
  if (agentId === undefined) cache.clear();
  else cache.delete(agentId);
}

// ════════════════════════════════════════════════════════════
// Detecção
// ════════════════════════════════════════════════════════════

export type ObjectionMatch = {
  match: ObjectionRow;
  matchedKeywords: string[];
  matchedRegex: string[];
};

export type DetectResult = {
  match: ObjectionMatch | null;
  reason: string;
};

export async function detectObjection(
  agentId: number,
  conversationId: number,
  leadText: string
): Promise<DetectResult> {
  if (!leadText || leadText.length < 2) {
    return { match: null, reason: "texto vazio" };
  }

  const all = await loadObjections(agentId);
  if (all.length === 0) {
    return { match: null, reason: "agente sem objeções cadastradas" };
  }

  const norm = normalize(leadText);
  const candidates: ObjectionMatch[] = [];

  for (const obj of all) {
    const matchedKw: string[] = [];
    for (const kw of obj.triggerKeywords) {
      if (kw && norm.includes(kw)) matchedKw.push(kw);
    }
    const matchedRx: string[] = [];
    for (const rx of obj.triggerRegex) {
      if (rx.test(norm)) matchedRx.push(rx.source);
    }
    if (matchedKw.length > 0 || matchedRx.length > 0) {
      candidates.push({ match: obj, matchedKeywords: matchedKw, matchedRegex: matchedRx });
    }
  }

  if (candidates.length === 0) {
    return { match: null, reason: "nenhuma objeção bateu" };
  }

  const alreadyDispatched = await getDispatchedObjectionIds(conversationId);
  const filtered = candidates.filter(c => {
    if (!c.match.sendOncePerConversation) return true;
    return !alreadyDispatched.has(c.match.id);
  });

  if (filtered.length === 0) {
    return { match: null, reason: "todas objeções já foram disparadas nesta conversa" };
  }

  filtered.sort((a, b) => {
    if (a.match.priority !== b.match.priority) return a.match.priority - b.match.priority;
    const sa = a.matchedKeywords.length + a.matchedRegex.length;
    const sb = b.matchedKeywords.length + b.matchedRegex.length;
    return sb - sa;
  });

  return { match: filtered[0], reason: "ok" };
}

// ════════════════════════════════════════════════════════════
// Marcação de disparo (chamar APÓS o envio bem sucedido)
// ════════════════════════════════════════════════════════════

export async function recordObjectionDispatch(
  conversationId: number,
  objectionId: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(objectionDispatches).values({ conversationId, objectionId });
}

async function getDispatchedObjectionIds(conversationId: number): Promise<Set<number>> {
  const db = await getDb();
  if (!db) return new Set();
  const rows = await db
    .select({ objectionId: objectionDispatches.objectionId })
    .from(objectionDispatches)
    .where(eq(objectionDispatches.conversationId, conversationId));
  return new Set(rows.map(r => r.objectionId));
}

// ════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════

export function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseJsonArray(s: string | null): unknown[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════════════
// Hint pra ser injetado no system prompt
// ════════════════════════════════════════════════════════════

export function buildObjectionHint(match: ObjectionMatch): string {
  const obj = match.match;
  if (obj.literalResponse) {
    return `MODO LITERAL OBJEÇÃO\nResposta exata a enviar:\n${obj.responseTemplate}`;
  }
  return [
    `OBJEÇÃO DETECTADA: "${obj.name}".`,
    `Gatilhos que bateram: ${[...match.matchedKeywords, ...match.matchedRegex].join(", ")}.`,
    `Como responder (use como guia, adaptando ao tom da conversa, mantendo o conteúdo):`,
    obj.responseTemplate,
    `Após responder a objeção, ${
      obj.nextStepAction === "advance"
        ? "avance para a próxima etapa do funil"
        : obj.nextStepAction === "restart"
        ? "retome a etapa atual desde o início"
        : "permaneça na etapa atual"
    }.`,
  ].join("\n");
}

/** Para testes: injeta items no cache. */
export function _setCacheForTests(agentId: number, items: ObjectionRow[]) {
  cache.set(agentId, { items, expiresAt: Date.now() + 60_000 });
}

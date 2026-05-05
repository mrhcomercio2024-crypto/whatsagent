/**
 * Guard de nome do lead: só liberamos `leadName` para o prompt se o lead
 * realmente disse o nome no chat. O nome do perfil do WhatsApp / Z-API
 * (`pushName` / `senderName`) NÃO conta — pode ser apelido aleatório.
 *
 * Estratégia heurística:
 *  - Se o nome no DB é vazio → retorna null.
 *  - Se algum inbound do histórico contém uma das fórmulas de auto-apresentação
 *    (ex.: "meu nome é X", "me chamo X", "sou o X", "aqui é X"), ou contém
 *    o próprio nome do DB como token, consideramos válido.
 *  - Caso contrário, consideramos "perfil-only" e retornamos null.
 */

import type { Message as DbMessage } from "../../drizzle/schema";

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const SELF_INTRO_PATTERNS = [
  /\bmeu nome (?:e|eh|é)\b/,
  /\bme chamo\b/,
  /\bsou (?:o|a|os|as)?\b/, // "sou o joao"
  /\baqui (?:e|eh|é) (?:o|a)?\b/,
  /\bpode me chamar de\b/,
  /\bsou eu\b/,
  /\bnome[:\s]+\w+/,
];

/**
 * Retorna true se algum inbound do histórico parece conter o nome do lead
 * informado pelo próprio lead.
 */
export function leadDisclosedName(
  history: DbMessage[] | undefined,
  dbName: string | null | undefined
): boolean {
  if (!history || history.length === 0) return false;
  const dbNameNorm = norm(dbName || "");
  for (const m of history) {
    if (m.direction !== "inbound") continue;
    const body = norm(m.body || "");
    if (!body) continue;
    if (SELF_INTRO_PATTERNS.some(re => re.test(body))) return true;
    if (dbNameNorm && dbNameNorm.length >= 3) {
      // Nome do DB tem que aparecer como token isolado no inbound do lead.
      const tokens = body.split(" ");
      const firstName = dbNameNorm.split(" ")[0];
      if (firstName.length >= 3 && tokens.includes(firstName)) return true;
    }
  }
  return false;
}

/**
 * Resolve o `leadName` que será passado para o prompt:
 *  - Retorna o nome do DB SOMENTE se o lead já se apresentou no chat.
 *  - Caso contrário, retorna null (prompt instrui a IA a perguntar).
 */
export function resolveLeadNameForPrompt(opts: {
  history: DbMessage[] | undefined;
  dbName: string | null | undefined;
}): string | null {
  const dbName = (opts.dbName || "").trim();
  if (!dbName) return null;
  return leadDisclosedName(opts.history, dbName) ? dbName : null;
}

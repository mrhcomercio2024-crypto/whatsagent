/**
 * Helpers puros para o filtro de busca da página /retries.
 *
 * Regras:
 * - Se o termo tem ao menos 4 dígitos, considera "telefone" e devolve só os
 *   dígitos (sem máscaras, +, espaços, parênteses, traços).
 * - Senão, considera "nome" e devolve trim + lower.
 * - Strings vazias após normalização viram null (= sem filtro).
 */

export type NormalizedSearch =
  | { kind: "phone"; digits: string }
  | { kind: "name"; text: string }
  | null;

export function normalizeSearch(raw: string | null | undefined): NormalizedSearch {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D+/g, "");

  // se a string original é majoritariamente dígitos OU tem >= 4 dígitos, é telefone
  if (digits.length >= 4 && digits.length / trimmed.length >= 0.5) {
    return { kind: "phone", digits };
  }

  const text = trimmed.toLowerCase();
  if (!text) return null;
  return { kind: "name", text };
}

/**
 * Escapa caracteres especiais de LIKE (% e _) para evitar match acidental.
 */
export function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

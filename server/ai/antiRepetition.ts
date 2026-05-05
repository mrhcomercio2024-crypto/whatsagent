/**
 * Guard anti-repetição: detecta quando a saída da IA é idêntica ou
 * fortemente similar a uma das últimas N respostas da própria IA.
 *
 * Heurísticas:
 *  - Normalização: lowercase + remoção de acentos + colapso de espaços/pontuação.
 *  - Igualdade exata (após normalização) → repetida.
 *  - Similaridade Jaccard de tokens >= 0.72 com mensagens curtas (<= 25 palavras)
 *    ou >= 0.65 com mensagens longas → repetida (paráfrase).
 */

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function tokens(s: string): Set<string> {
  return new Set(norm(s).split(" ").filter(t => t.length >= 3));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  a.forEach(t => { if (b.has(t)) inter++; });
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export type RepetitionResult = {
  repeats: boolean;
  reason?: "exact" | "near";
  similarity?: number;
  matched?: string;
};

export function detectRepetition(
  candidate: string,
  previousOutbounds: string[]
): RepetitionResult {
  const cand = norm(candidate);
  if (!cand) return { repeats: false };
  const candTokens = tokens(candidate);
  const wordCount = cand.split(" ").filter(Boolean).length;

  for (const prev of previousOutbounds) {
    const p = norm(prev);
    if (!p) continue;
    if (p === cand) {
      return { repeats: true, reason: "exact", similarity: 1, matched: prev };
    }
    const sim = jaccard(candTokens, tokens(prev));
    const threshold = wordCount <= 25 ? 0.6 : 0.5;
    if (sim >= threshold) {
      return { repeats: true, reason: "near", similarity: sim, matched: prev };
    }
  }
  return { repeats: false };
}

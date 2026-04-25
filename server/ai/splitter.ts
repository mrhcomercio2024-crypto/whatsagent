/**
 * Quebra textos longos em vários "balões" para que a conversa pareça
 * mais humana no WhatsApp.
 *
 * Estratégia em camadas (cada camada só roda se a anterior produziu pedaço maior que o limite):
 *   1) Quebra por parágrafos (linhas em branco).
 *   2) Quebra por frases (ponto, exclamação, interrogação).
 *   3) Quebra por palavras respeitando o limite máximo (sem cortar palavra no meio).
 *
 * Sempre faz `trim()` em cada pedaço e remove vazios.
 */

export type SplitterOptions = {
  enabled?: boolean;
  maxChars?: number;
};

const DEFAULT_MAX = 220;

export function splitMessage(
  text: string,
  options: SplitterOptions = {}
): string[] {
  const enabled = options.enabled !== false;
  const maxChars = Math.max(40, options.maxChars ?? DEFAULT_MAX);

  const cleaned = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];
  if (!enabled) return [cleaned];

  // 1) parágrafos
  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const balloons: string[] = [];
  for (const p of paragraphs) {
    if (p.length <= maxChars) {
      balloons.push(p);
      continue;
    }

    // 2) frases dentro de parágrafos longos
    const sentences = splitIntoSentences(p);
    let buffer = "";
    for (const sentence of sentences) {
      if (sentence.length > maxChars) {
        // descarrega buffer atual
        if (buffer) {
          balloons.push(buffer.trim());
          buffer = "";
        }
        // 3) palavras
        for (const chunk of splitByWords(sentence, maxChars)) {
          balloons.push(chunk);
        }
        continue;
      }
      const candidate = buffer ? `${buffer} ${sentence}` : sentence;
      if (candidate.length > maxChars) {
        if (buffer) balloons.push(buffer.trim());
        buffer = sentence;
      } else {
        buffer = candidate;
      }
    }
    if (buffer) balloons.push(buffer.trim());
  }

  return balloons.filter(Boolean);
}

function splitIntoSentences(text: string): string[] {
  // mantém o terminador na própria sentença
  const parts = text.split(/(?<=[.!?…])\s+/g);
  return parts.map((s) => s.trim()).filter(Boolean);
}

function splitByWords(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let buffer = "";
  for (const w of words) {
    if (w.length > maxChars) {
      // palavra absurdamente grande (link gigante etc.) — quebra "duro"
      if (buffer) {
        out.push(buffer.trim());
        buffer = "";
      }
      for (let i = 0; i < w.length; i += maxChars) {
        out.push(w.slice(i, i + maxChars));
      }
      continue;
    }
    const candidate = buffer ? `${buffer} ${w}` : w;
    if (candidate.length > maxChars) {
      out.push(buffer.trim());
      buffer = w;
    } else {
      buffer = candidate;
    }
  }
  if (buffer) out.push(buffer.trim());
  return out;
}

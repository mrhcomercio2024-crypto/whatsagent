/**
 * Detecta quando a IA está "pulando etapas": respondendo um conteúdo que
 * pertenceria a uma etapa POSTERIOR à etapa atual (ex.: já explica como
 * funciona o produto/preço/condições enquanto a etapa atual era apenas
 * "cumprimentar e perguntar o nome").
 *
 * Estratégia leve, sem LLM:
 * - Extrai palavras-chave significativas (>=5 letras, sem stopwords) das
 *   instruções de cada etapa futura.
 * - Conta quantas dessas keywords aparecem no `text` da IA.
 * - Calcula o mesmo para a etapa atual.
 * - Se uma etapa futura "ganha" da etapa atual por margem confortável,
 *   considera que houve antecipação.
 */

const STOPWORDS = new Set([
  "para",
  "como",
  "esse",
  "essa",
  "este",
  "esta",
  "isso",
  "aquele",
  "aquela",
  "uma",
  "umas",
  "uns",
  "tem",
  "tinha",
  "ter",
  "ser",
  "esta",
  "esto",
  "fazer",
  "feito",
  "muito",
  "muita",
  "pouco",
  "pouca",
  "depois",
  "antes",
  "agora",
  "ainda",
  "tambem",
  "tambm",
  "qual",
  "quais",
  "quando",
  "onde",
  "porque",
  "porqu",
  "voce",
  "voc",
  "voces",
  "vocs",
  "obrigada",
  "obrigado",
  "olhar",
  "fala",
  "diga",
  "fazer",
  "passa",
  "passar",
  "aqui",
  "esto",
  "estao",
  "estavam",
  "houve",
  "haver",
  "qualquer",
  "todos",
  "todas",
  "deve",
  "devem",
  "pode",
  "podem",
  "posso",
  "pelo",
  "pela",
  "pelos",
  "pelas",
  "para",
  "ento",
  "entao",
  "porm",
  "porem",
  "mas",
  "que",
  "qual",
  "quanto",
  "lead",
]);

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function extractKeywords(s: string | null | undefined): Set<string> {
  if (!s) return new Set();
  return new Set(
    norm(s)
      .split(/[^a-z0-9]+/)
      .filter(t => t.length >= 5 && !STOPWORDS.has(t))
  );
}

export type StepShape = {
  id: number;
  name?: string | null;
  instructions?: string | null;
  orderIndex?: number;
};

export type StepSkipResult = {
  skipped: boolean;
  /** Nome da etapa "futura" cuja matéria a IA antecipou */
  jumpedTo?: string;
  /** Keywords da etapa futura encontradas no texto */
  matchedKeywords?: string[];
  reason?: string;
};

/**
 * @param text texto produzido pela IA
 * @param current etapa atual
 * @param all     todas as etapas, em ordem
 * @param firstTurn se true, é a primeira resposta da IA (regra mais dura)
 */
export function looksLikeStepSkip(
  text: string,
  current: StepShape | null | undefined,
  all: StepShape[],
  firstTurn: boolean = false
): StepSkipResult {
  if (!text || !current || !all || all.length === 0) {
    return { skipped: false };
  }
  const ordered = [...all].sort(
    (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
  );
  const idx = ordered.findIndex(s => s.id === current.id);
  if (idx < 0 || idx === ordered.length - 1) return { skipped: false };

  const futures = ordered.slice(idx + 1);
  if (futures.length === 0) return { skipped: false };

  const haystack = norm(text);
  const currentKw = extractKeywords(
    `${current.name ?? ""} ${current.instructions ?? ""}`
  );
  const currentHits = Array.from(currentKw).filter(k => haystack.includes(k));
  const currentScore = currentHits.length;

  // Mínimo absoluto de matches numa etapa futura para considerar suspeita
  const MIN_FUTURE_HITS = firstTurn ? 1 : 2;
  // Margem necessária sobre a etapa atual
  const MARGIN = firstTurn ? 1 : 2;

  for (const f of futures) {
    const kw = extractKeywords(`${f.name ?? ""} ${f.instructions ?? ""}`);
    if (kw.size === 0) continue;
    const hits = Array.from(kw).filter(k => haystack.includes(k));
    if (
      hits.length >= MIN_FUTURE_HITS &&
      hits.length >= currentScore + MARGIN
    ) {
      return {
        skipped: true,
        jumpedTo: f.name ?? `etapa #${f.id}`,
        matchedKeywords: hits,
        reason: firstTurn
          ? `primeiro turno respondendo conteúdo de "${f.name}"`
          : `respondeu conteúdo de "${f.name}" antes da hora`,
      };
    }
  }
  return { skipped: false };
}

/**
 * `stepAdvance` (vindo do parser) só vale se houve interação real do lead
 * E há pelo menos uma resposta nova do lead nesta etapa. Se for o primeiro
 * turno, NUNCA permitimos avanço — o agente precisa pelo menos executar a
 * etapa atual uma vez.
 */
export function canAdvanceStep(opts: {
  parsedAdvance: boolean;
  isFirstTurn: boolean;
  inboundCountInStep: number;
}): boolean {
  if (!opts.parsedAdvance) return false;
  if (opts.isFirstTurn) return false;
  if (opts.inboundCountInStep < 1) return false;
  return true;
}

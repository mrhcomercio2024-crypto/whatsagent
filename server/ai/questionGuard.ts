/**
 * Detecta perguntas diretas do lead que exigem resposta substantiva,
 * NÃO apenas mais perguntas. Casos típicos:
 *   - "quanto custa?", "qual o valor?", "preço?"
 *   - "como funciona?"
 *   - "tem garantia?", "tem suporte?"
 *   - "quais produtos?", "quais cursos?"
 *   - "voces atendem em X?"
 *
 * E checa se a resposta da IA realmente endereçou a pergunta.
 * Heurística:
 *   - Identifica a "categoria" da pergunta (price | how | guarantee | catalog | other_yesno).
 *   - Para cada categoria, há marcadores que devem aparecer na resposta.
 *   - Se a resposta tiver apenas perguntas (termina em ? e não tem
 *     marcadores) → considera "não respondeu".
 */

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

export type QuestionCategory =
  | "price"
  | "how_works"
  | "guarantee"
  | "catalog"
  | "other_question"
  | "none";

export function classifyQuestion(inboundText: string): QuestionCategory {
  const t = norm(inboundText);
  if (!t) return "none";
  const isQuestion = t.includes("?") || /\b(quanto|qual|quais|como|onde|quando|tem |voce|aceita|funciona|inclui|cobra|custa|valor|preco|precos|quanto e|quanto custa|paga)\b/.test(t);
  if (!isQuestion) return "none";

  if (/\b(quanto|valor|preco|precos|custa|investimento|paga|mensalidade)\b/.test(t)) return "price";
  if (/\b(como funciona|como (?:e|eh|é)|funciona como|metodo|metod|metodologia)\b/.test(t)) return "how_works";
  if (/\b(garantia|reembolso|devolucao|cancelar|cancela)\b/.test(t)) return "guarantee";
  if (/\b(quais (?:produtos|cursos|servicos|planos)|tem (?:curso|produto|plano|servico))\b/.test(t)) return "catalog";
  return "other_question";
}

const ANSWER_MARKERS: Record<Exclude<QuestionCategory, "none">, RegExp> = {
  price: /(r\$|\bmensal|\bpor mes|\bvalor|\bcust|\b\d+[.,]?\d*\s*(?:reais|reai|brl)|\bplano|\binvest|\bpacote)/,
  how_works: /(\bfunciona\b|\bo passo|\bprimeiro\b|\bdepois\b|\bvoce\b.*?(receb|acess|paga|escolh)|\betapa\b|\bproces)/,
  guarantee: /(\bgarantia\b|\b\d+\s*dias?\b|\breembols|\bdevolv|\bcancel)/,
  catalog: /(\boferec|\btemos|\bdispon|\bplano|\bproduto|\bcurso|\bservico|\bvenda|\bvender)/,
  other_question: /\b(sim|nao|n[aã]o|exato|isso|certo|claro|confirmo|atendemos|trabalhamos|temos|oferecemos)\b/,
};

export function answerLooksSubstantive(
  category: QuestionCategory,
  aiText: string
): boolean {
  if (category === "none") return true;
  const t = norm(aiText);
  if (!t) return false;

  // Se a resposta é só uma pergunta, claramente não respondeu nada.
  const onlyQuestion =
    /^[^.!?]*\?\s*$/.test(aiText.trim()) ||
    (aiText.trim().endsWith("?") && !aiText.includes("."));
  if (onlyQuestion) {
    // Pode ser pergunta de esclarecimento legítima — só consideramos "não respondeu"
    // se NENHUM marcador estiver presente.
    const re = ANSWER_MARKERS[category];
    return re.test(t);
  }

  const re = ANSWER_MARKERS[category];
  return re.test(t);
}

export function leadQuestionUnaddressed(opts: {
  inboundText: string;
  aiText: string;
}): { unaddressed: boolean; category: QuestionCategory } {
  const category = classifyQuestion(opts.inboundText);
  if (category === "none") return { unaddressed: false, category };
  const ok = answerLooksSubstantive(category, opts.aiText);
  return { unaddressed: !ok, category };
}

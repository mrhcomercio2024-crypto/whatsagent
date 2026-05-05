/**
 * Guard contra "greeting loop" / saída trivial do LLM.
 *
 * Sintoma observado em produção:
 *   1ª resposta: "Boa tarde! Entendi. O vídeo que te mandei..."  (252 chars)
 *   2ª resposta: "Boa tarde! [STEP_ADVANCE]"                     (25 chars)
 *   3ª resposta: "Boa tarde!"                                    (10 chars)
 *
 * O LLM aprende do histórico que cumprimentar é uma resposta válida e fica
 * preso num loop trivial. Isso é especialmente comum quando o prompt do
 * sistema enfatiza saudação ou quando a conversa já tem várias trocas.
 *
 * Critério: a saída é considerada trivial quando, removidas as marcações
 * internas, o que sobra é APENAS um cumprimento (ou variação curta dele) —
 * E o histórico já contém uma mensagem outbound da IA. Nesse cenário,
 * regenerar a mensagem é melhor do que enviá-la.
 */

const GREETING_PATTERNS = [
  /^bom\s*dia[!.\s]*$/i,
  /^boa\s*tarde[!.\s]*$/i,
  /^boa\s*noite[!.\s]*$/i,
  /^ol[áa][!.\s]*$/i,
  /^oi[!.\s]*$/i,
  /^ola[!.\s]*$/i,
  /^e[ai][!.\s]*$/i,
  /^salve[!.\s]*$/i,
  /^opa[!.\s]*$/i,
  /^tudo\s*bem[?.!\s]*$/i,
  /^como\s*vai[?.!\s]*$/i,
];

/**
 * Detecta se o texto é apenas um cumprimento isolado (sem conteúdo real).
 */
export function isTrivialGreeting(text: string | null | undefined): boolean {
  if (!text) return false;
  const stripped = text.trim();
  if (!stripped) return false;
  // Saída muito curta sem ponto final/perguntas e sem palavras de conteúdo
  if (stripped.length > 30) return false;
  return GREETING_PATTERNS.some(p => p.test(stripped));
}

/**
 * Detecta se a saída é "trivial" no contexto: apenas cumprimento E a IA
 * já mandou uma mensagem antes (ou seja, não é a primeira interação).
 */
export function isTrivialOutputInContext(opts: {
  cleanText: string;
  hasMediaActions: boolean;
  isFirstAiTurn: boolean;
}): boolean {
  // Se está enviando mídia junto, não é trivial.
  if (opts.hasMediaActions) return false;
  // No primeiríssimo turno é OK responder com saudação curta.
  if (opts.isFirstAiTurn) return false;
  return isTrivialGreeting(opts.cleanText);
}

/**
 * Decide se a etapa atual atingiu o teto de mensagens da IA e deve
 * avançar automaticamente para a próxima etapa.
 *
 * - `aiMessagesInStep`: quantas mensagens outbound da IA já foram enviadas
 *   desde que a conversa entrou na etapa atual.
 * - `maxMessages`: limite configurado por etapa. null/undefined/0 = sem limite.
 *
 * Regras:
 * - Sem limite (null/0/negativo) → nunca auto-avança por contagem.
 * - Limite N positivo → auto-avança quando `aiMessagesInStep >= N` antes
 *   de gerar a próxima mensagem.
 */
export function shouldAutoAdvanceByCount(
  aiMessagesInStep: number,
  maxMessages?: number | null
): boolean {
  if (maxMessages == null) return false;
  if (!Number.isFinite(maxMessages)) return false;
  if (maxMessages <= 0) return false;
  if (!Number.isFinite(aiMessagesInStep) || aiMessagesInStep < 0) return false;
  return aiMessagesInStep >= maxMessages;
}

/**
 * Conta mensagens outbound da IA pertencentes à etapa atual, dado o
 * histórico ordenado e o id da etapa atual. Reseta a contagem em qualquer
 * mensagem cujo `metadata.stepId` mude (ou inexistente).
 *
 * Versão tolerante: se nenhuma mensagem tem stepId no metadata, usa o
 * marcador `conversationCurrentStepSince` (timestamp em ms) — mensagens
 * outbound da IA com createdAt >= esse timestamp contam.
 */
export type CountInput = {
  messages: Array<{
    direction: "inbound" | "outbound";
    sender: "lead" | "ai" | "human" | "system";
    metadata?: { stepId?: number | null } | null;
    createdAt?: Date | string | number | null;
  }>;
  currentStepId: number | null | undefined;
  /** Marcação de quando a conversa entrou na etapa atual (fallback) */
  conversationCurrentStepSince?: Date | string | number | null;
};

export function countAiMessagesInCurrentStep(input: CountInput): number {
  const { messages, currentStepId, conversationCurrentStepSince } = input;
  if (!currentStepId) return 0;

  // Caminho preferido: metadata.stepId
  const taggedAny = messages.some(
    m => m.metadata && typeof (m.metadata as any).stepId === "number"
  );
  if (taggedAny) {
    return messages.filter(
      m =>
        m.direction === "outbound" &&
        m.sender === "ai" &&
        m.metadata &&
        (m.metadata as any).stepId === currentStepId
    ).length;
  }

  // Fallback temporal
  if (conversationCurrentStepSince == null) {
    // Sem marcador: conta todas as mensagens da IA da conversa
    return messages.filter(
      m => m.direction === "outbound" && m.sender === "ai"
    ).length;
  }
  const since = new Date(conversationCurrentStepSince).getTime();
  return messages.filter(m => {
    if (m.direction !== "outbound" || m.sender !== "ai") return false;
    const t = m.createdAt ? new Date(m.createdAt as any).getTime() : 0;
    return t >= since;
  }).length;
}

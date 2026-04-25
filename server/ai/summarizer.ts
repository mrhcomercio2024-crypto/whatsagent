/**
 * Resumidor evolutivo de conversas.
 *
 * Estratégia (mantida deliberadamente simples):
 *   - Pegamos as últimas N mensagens (default 30) e o resumo anterior
 *   - Pedimos ao LLM um novo resumo curto (até ~700 chars) que carregue
 *     toda a memória útil para o agente continuar de onde parou:
 *     intenção do lead, objeções, dores, dados coletados (nome, segmento,
 *     orçamento, etapa concluída) e tom da conversa
 *   - Persistimos em `conversations.summary` + `summaryUpdatedAt`
 *
 * O resumo é sempre em pt-BR e estritamente factual; nada de promessas.
 */

import type { Agent } from "../../drizzle/schema";
import { invokeWithModel } from "./invoke";
import { listMessages, updateConversation } from "../db";

const SUMMARY_TARGET_CHARS = 700;

function transcriptOfMessages(
  msgs: Array<{ direction: string; sender: string; body: string | null; createdAt: Date | null }>,
  max = 30
): string {
  const tail = msgs.slice(-max);
  return tail
    .map(m => {
      const who =
        m.direction === "inbound"
          ? "Lead"
          : m.sender === "human"
            ? "Operador"
            : "Agente";
      const body = (m.body ?? "").replace(/\s+/g, " ").trim();
      if (!body) return "";
      return `${who}: ${body}`;
    })
    .filter(Boolean)
    .join("\n");
}

export type SummaryUpdateInput = {
  agent: Agent;
  conversationId: number;
  previousSummary?: string | null;
};

/**
 * Atualiza o resumo da conversa. Falhas não derrubam o orchestrator.
 */
export async function refreshConversationSummary(
  input: SummaryUpdateInput
): Promise<string | null> {
  const { agent, conversationId, previousSummary } = input;
  const msgs = await listMessages(conversationId, { limit: 200 });
  if (msgs.length === 0) return previousSummary ?? null;

  const transcript = transcriptOfMessages(msgs, 30);

  const sys =
    `Você é um sumarizador para um agente de WhatsApp. ` +
    `Seu trabalho é manter um RESUMO EVOLUTIVO da conversa em pt-BR, ` +
    `denso e estritamente factual. Use no máximo ${SUMMARY_TARGET_CHARS} caracteres. ` +
    `O resumo deve incluir, quando aparecerem: nome do lead, segmento/empresa, ` +
    `intenção/produto desejado, objeções já levantadas, dados coletados (orçamento, prazo, dor), ` +
    `etapas do script já concluídas e onde a conversa parou. ` +
    `NÃO invente informação, NÃO faça promessas, NÃO escreva como mensagem para o lead — ` +
    `escreva como anotação interna do operador.`;

  const user =
    `RESUMO ANTERIOR (pode estar vazio):\n${(previousSummary ?? "").trim() || "(vazio)"}\n\n` +
    `ÚLTIMAS MENSAGENS DA CONVERSA:\n${transcript}\n\n` +
    `Reescreva o resumo evolutivo agora, em texto corrido, no máximo ${SUMMARY_TARGET_CHARS} caracteres.`;

  try {
    const r = await invokeWithModel({
      model: agent.defaultLlmModel,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      maxTokens: 350,
      temperature: 0.2,
      tracking: {
        purpose: "summary",
        agentId: agent.id,
        conversationId,
      },
    });
    let summary = (r.text || "").trim();
    if (summary.length > SUMMARY_TARGET_CHARS + 200) {
      summary = summary.slice(0, SUMMARY_TARGET_CHARS + 200);
    }
    if (!summary) return previousSummary ?? null;
    await updateConversation(conversationId, {
      summary,
      summaryUpdatedAt: new Date(),
    });
    return summary;
  } catch (e) {
    console.warn(
      `[summarizer] falha ao atualizar resumo conv=${conversationId}: ${(e as Error).message}`
    );
    return previousSummary ?? null;
  }
}

/**
 * Heurística leve: só roda o resumidor a cada N mensagens novas (default 6)
 * para não consumir LLM desnecessariamente.
 */
export function shouldRefreshSummary(opts: {
  totalMessages: number;
  lastSummaryAtMessages?: number | null;
  every?: number;
}): boolean {
  const every = opts.every ?? 6;
  if (opts.totalMessages <= 0) return false;
  if (opts.totalMessages < every) return opts.totalMessages === every;
  if (opts.lastSummaryAtMessages == null) return true;
  return opts.totalMessages - opts.lastSummaryAtMessages >= every;
}

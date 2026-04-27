/**
 * Classificador automático de "status do lead".
 *
 * A cada mensagem inbound, o classificador lê a descrição das regras configuradas
 * para o agente (por ex.: "membro WeDrop = lead menciona que já é aluno/comprou/etc.")
 * e escolhe no máximo UMA regra que melhor descreve a situação revelada — ou
 * "none" se nada se encaixa.
 *
 * O resultado é usado para:
 *  - Atribuir `lead.statusTag = slug`
 *  - Travar o atendimento (replyWhenBlocked) quando a regra é isBlocking
 *  - Opcionalmente fazer handoff e notificar dono
 *
 * Princípios:
 *  - Modelo barato (gpt-4o-mini default)
 *  - Resposta JSON estrita para evitar ambiguidade
 *  - Em caso de qualquer dúvida, retorna "none" (melhor errar pra menos do
 *    que travar um lead legítimo indevidamente)
 */
import { invokeWithModel } from "./invoke";
import type { LeadStatusRule } from "../../drizzle/schema";

export type StatusClassification = {
  slug: string | null;
  reason: string;
};

export async function classifyLeadStatus(opts: {
  rules: LeadStatusRule[];
  history: Array<{ role: "user" | "assistant"; text: string }>;
  lastInboundText: string;
  model?: string;
  tracking?: { agentId?: number; conversationId?: number; leadId?: number };
}): Promise<StatusClassification> {
  const activeRules = opts.rules.filter(r => r.isActive);
  if (activeRules.length === 0) {
    return { slug: null, reason: "Nenhuma regra ativa." };
  }
  if (!opts.lastInboundText || !opts.lastInboundText.trim()) {
    return { slug: null, reason: "Mensagem do lead vazia." };
  }

  // Último 6 turnos para dar contexto sem inflar tokens
  const transcript = opts.history
    .slice(-6)
    .map(h => `${h.role === "user" ? "Lead" : "Agente"}: ${h.text}`)
    .join("\n");

  const rulesText = activeRules
    .map(r => `- slug="${r.slug}" | label="${r.label}" | descrição: ${r.description}`)
    .join("\n");

  const sys = `Você classifica o STATUS atual do lead em uma conversa de vendas no WhatsApp.

REGRAS DISPONÍVEIS (escolha no máximo UMA):
${rulesText}

INSTRUÇÕES:
- Leia o ÚLTIMO TURNO do lead e o histórico recente.
- Se o lead revelar EXPLICITAMENTE uma das situações descritas nas regras acima, responda o slug exato.
- Se não houver evidência clara e explícita, responda "none". NÃO adivinhe.
- "Dúvida razoável" = responda "none".
- Responda APENAS com JSON válido: {"slug":"<slug|none>","reason":"breve razão em 1 frase"}`;

  const user = `## ÚLTIMA MENSAGEM DO LEAD\n${opts.lastInboundText}\n\n## HISTÓRICO RECENTE\n${transcript || "(vazio)"}`;

  try {
    const { text } = await invokeWithModel({
      model: opts.model || "gpt-4o-mini",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      responseFormat: { type: "json_object" },
      maxTokens: 150,
      temperature: 0,
      tracking: opts.tracking
        ? { purpose: "status_classifier", ...opts.tracking }
        : undefined,
    });
    const parsed = JSON.parse(text) as { slug?: string; reason?: string };
    const slug = (parsed.slug || "").trim();
    if (!slug || slug === "none") {
      return { slug: null, reason: parsed.reason || "Nenhuma regra bateu." };
    }
    const hit = activeRules.find(r => r.slug === slug);
    if (!hit) {
      // LLM inventou um slug que não existe — tratamos como none.
      return { slug: null, reason: `Slug inválido: ${slug}` };
    }
    return { slug: hit.slug, reason: parsed.reason || "" };
  } catch (e) {
    return { slug: null, reason: `Falha: ${(e as Error).message}` };
  }
}

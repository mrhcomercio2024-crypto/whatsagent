/**
 * Qualificação automática do lead em "quente", "morno" ou "frio".
 * Usa um modelo barato/rápido para classificar a partir do histórico.
 */
import { invokeWithModel } from "./invoke";

export type Temperature = "hot" | "warm" | "cold" | "unknown";

export async function qualifyLead(opts: {
  history: Array<{ role: "user" | "assistant"; text: string }>;
  model?: string;
  tracking?: { agentId?: number; conversationId?: number; leadId?: number };
}): Promise<{ temperature: Temperature; reason: string }> {
  if (opts.history.length === 0) {
    return { temperature: "unknown", reason: "Sem histórico." };
  }
  const transcript = opts.history
    .map(h => `${h.role === "user" ? "Lead" : "Agente"}: ${h.text}`)
    .join("\n");

  const sys = `Você classifica leads de vendas em três temperaturas:
- hot: demonstrou intenção real de compra (perguntou preço, prazo, forma de pagamento, quis fechar).
- warm: tem interesse mas ainda explorando.
- cold: respondeu pouco, sem demonstração de interesse.
- unknown: histórico insuficiente.
Responda APENAS com JSON: {"temperature":"hot|warm|cold|unknown","reason":"breve razão"}`;

  try {
    const { text } = await invokeWithModel({
      model: opts.model || "gpt-4o-mini",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: transcript },
      ],
      responseFormat: { type: "json_object" },
      maxTokens: 200,
      temperature: 0,
      tracking: opts.tracking ? { purpose: "qualifier", ...opts.tracking } : undefined,
    });
    const parsed = JSON.parse(text);
    const t = parsed.temperature as Temperature;
    if (!["hot", "warm", "cold", "unknown"].includes(t)) {
      return { temperature: "unknown", reason: "Resposta inválida da IA." };
    }
    return { temperature: t, reason: parsed.reason || "" };
  } catch (e) {
    return { temperature: "unknown", reason: `Falha: ${(e as Error).message}` };
  }
}

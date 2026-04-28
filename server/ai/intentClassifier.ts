/**
 * Classificador de intenção para disparo inteligente de mídia.
 *
 * Recebe:
 *  - lista de intents cadastradas pelo operador (label + descrição em
 *    linguagem natural)
 *  - texto da última mensagem do lead (+ histórico curto opcional)
 *
 * Retorna quais labels batem com a fala do lead.
 *
 * Usa uma chamada LLM enxuta (system + user + JSON schema). Se a lista de
 * intents estiver vazia ou a chamada falhar, retorna [] silenciosamente —
 * o orchestrator segue sem intent-match, preservando o fluxo tradicional.
 */
import { invokeWithModel } from "./invoke";

export type IntentDefinition = {
  label: string; // ex.: "duvida_preco"
  description: string; // ex.: "Lead pergunta ou demonstra dúvida sobre quanto custa"
};

export type IntentClassifierResult = {
  labels: string[];
  rawTokens?: { prompt?: number; completion?: number };
};

const SYSTEM_PROMPT = `Você é um classificador de intenção de mensagens de leads em uma conversa comercial por WhatsApp.
Receberá uma lista de INTENÇÕES pré-cadastradas (cada uma com um "label" curto e uma descrição em linguagem natural do que ela captura) e a ÚLTIMA MENSAGEM do lead.

Sua tarefa: identificar quais intenções (se houver) a mensagem do lead dispara.
Responda APENAS em JSON, seguindo o schema exigido.
- Se nenhuma intenção bater, retorne "labels": [].
- Nunca invente labels fora da lista fornecida.
- Seja conservador: não marque intenções sem evidência clara no texto.
- Leve em conta nuances do português brasileiro informal (gírias, abreviações, tom).`;

const RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "intent_match",
    strict: true,
    schema: {
      type: "object" as const,
      properties: {
        labels: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "Labels das intenções detectadas (subconjunto estrito da lista fornecida).",
        },
      },
      required: ["labels"],
      additionalProperties: false,
    },
  },
};

export async function classifyIntent(opts: {
  intents: IntentDefinition[];
  inboundText: string;
  model?: string;
  agentId?: number;
  conversationId?: number;
  leadId?: number;
}): Promise<IntentClassifierResult> {
  const { intents, inboundText } = opts;
  const trimmed = (inboundText || "").trim();
  if (!trimmed || intents.length === 0) {
    return { labels: [] };
  }

  const intentsBlock = intents
    .map((i, idx) => `${idx + 1}. label="${i.label}" → ${i.description || "(sem descrição)"}`)
    .join("\n");

  const userMessage = `INTENÇÕES DISPONÍVEIS:
${intentsBlock}

MENSAGEM DO LEAD:
<<<
${trimmed}
>>>

Quais intenções são disparadas por esta mensagem? Responda em JSON.`;

  try {
    const r = await invokeWithModel({
      model: opts.model || "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0,
      maxTokens: 200,
      responseFormat: RESPONSE_FORMAT,
      tracking: {
        purpose: "intent_classifier",
        agentId: opts.agentId,
        conversationId: opts.conversationId,
        leadId: opts.leadId,
      },
    });
    const parsed = parseJsonSafe(r.text);
    if (!parsed || !Array.isArray(parsed.labels)) return { labels: [] };
    const allowed = new Set(intents.map(i => i.label));
    const labels = parsed.labels
      .filter((x: unknown): x is string => typeof x === "string")
      .map((x: string) => x.trim())
      .filter((x: string) => x.length > 0 && allowed.has(x));
    return { labels: Array.from(new Set(labels)) };
  } catch {
    return { labels: [] };
  }
}

function parseJsonSafe(raw: string): any | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Tenta extrair bloco { ... }
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

/**
 * Resolve media IDs a partir de labels de intenção detectadas.
 * Dado um conjunto de triggers type="intent" e uma lista de labels, devolve os mediaIds únicos.
 */
export function resolveMediaIdsFromIntents(
  triggers: Array<{
    triggerType: string;
    isActive: boolean;
    mediaId: number;
    intentLabel: string | null;
    sendOncePerConversation: boolean;
  }>,
  detectedLabels: string[],
  alreadySentMediaIds: number[] = []
): number[] {
  const ids: number[] = [];
  const set = new Set(detectedLabels.map(l => l.trim()).filter(Boolean));
  for (const t of triggers) {
    if (!t.isActive) continue;
    if (t.triggerType !== "intent") continue;
    if (!t.intentLabel) continue;
    if (!set.has(t.intentLabel)) continue;
    if (t.sendOncePerConversation && alreadySentMediaIds.includes(t.mediaId)) continue;
    ids.push(t.mediaId);
  }
  return Array.from(new Set(ids));
}

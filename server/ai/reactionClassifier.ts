/**
 * Classificador da reação do lead a uma mídia recém-enviada.
 *
 * Quando o agente envia uma mídia e ainda não recebeu resposta, marcamos
 * `conversation.awaitingReactionMediaId`. Na próxima mensagem inbound, este
 * classificador analisa a reação: positiva (gostou/curtiu/pergunta boa),
 * neutra (continuou o assunto sem comentar), negativa (não gostou, questionou),
 * ignorada (mudou completamente de assunto).
 *
 * A label é gravada em `conversation.lastMediaReaction` e usada no prompt do
 * próximo turno para o agente comentar a reação de forma natural.
 */
import { invokeWithModel } from "./invoke";

export type MediaReaction = "positive" | "neutral" | "negative" | "ignored";

export type ClassifyReactionInput = {
  /** Nome ou descrição curta da mídia enviada (ex: "vídeo com link"). */
  mediaName: string;
  /** Mensagem do lead logo após o envio da mídia. */
  inboundText: string;
  /** Segundos decorridos entre envio da mídia e a mensagem do lead. */
  secondsSinceMedia?: number;
  agentId?: number;
  conversationId?: number;
  leadId?: number;
  model?: string;
};

export type ClassifyReactionResult = {
  reaction: MediaReaction;
  /** Texto curto e direto que o agente pode usar como ponte no próximo turno. */
  bridge: string | null;
};

const SYSTEM_PROMPT = `Você analisa como um lead reagiu a uma mídia (vídeo, imagem, áudio, documento) que acabou de ser enviada pelo vendedor num chat de WhatsApp.

Classifique a reação em UMA destas categorias:
- "positive" = lead comentou algo positivo, demonstrou interesse, fez pergunta relevante sobre a mídia
- "negative" = lead criticou, reclamou, mostrou desconfiança, disse que não gostou, pediu algo diferente
- "neutral" = lead continuou a conversa de forma normal, sem comentar a mídia diretamente
- "ignored" = lead mudou totalmente de assunto ou ignorou a mídia (voltou pra pergunta anterior, mudou tópico sem transição)

Retorne JSON com dois campos:
- "reaction": uma das 4 labels acima
- "bridge": texto curto (máximo 80 caracteres) que o vendedor pode usar pra continuar a conversa de forma NATURAL levando em conta a reação do lead. Se a reação for neutral e o lead fez uma pergunta, o bridge deve apenas seguir essa pergunta. Se positive, pode confirmar o interesse. Se negative, deve reconhecer o desconforto. Se ignored, não puxar a mídia de novo.`;

const RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "media_reaction",
    strict: true,
    schema: {
      type: "object",
      properties: {
        reaction: {
          type: "string",
          enum: ["positive", "negative", "neutral", "ignored"],
        },
        bridge: {
          type: ["string", "null"],
          maxLength: 120,
        },
      },
      required: ["reaction", "bridge"],
      additionalProperties: false,
    },
  },
};

function parseJsonSafe(raw: string): any {
  if (!raw) return null;
  const clean = raw.trim().replace(/^```json\n?/i, "").replace(/\n?```$/, "");
  try {
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

export async function classifyReaction(
  input: ClassifyReactionInput
): Promise<ClassifyReactionResult> {
  const userMessage = `Mídia enviada: "${input.mediaName}"
${
  input.secondsSinceMedia !== undefined
    ? `Tempo entre o envio e a resposta: ${Math.max(0, Math.round(input.secondsSinceMedia))}s`
    : ""
}

Mensagem do lead logo após o envio:
<<<
${input.inboundText}
>>>

Classifique a reação e retorne JSON.`;

  try {
    const r = await invokeWithModel({
      model: input.model || "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.1,
      maxTokens: 180,
      responseFormat: RESPONSE_FORMAT,
      tracking: {
        purpose: "reaction_classifier",
        agentId: input.agentId,
        conversationId: input.conversationId,
        leadId: input.leadId,
      },
    });
    const parsed = parseJsonSafe(r.text);
    if (!parsed || typeof parsed.reaction !== "string") {
      return { reaction: "neutral", bridge: null };
    }
    const reaction = parsed.reaction as MediaReaction;
    const bridge =
      typeof parsed.bridge === "string" && parsed.bridge.trim().length > 0
        ? parsed.bridge.trim().slice(0, 120)
        : null;
    return { reaction, bridge };
  } catch (e) {
    console.warn("[reaction-classifier] failed:", (e as Error)?.message);
    return { reaction: "neutral", bridge: null };
  }
}

/**
 * Função pura para testar a lógica de decidir se a reação é "ignored" por
 * timeout (lead passou muito tempo sem responder e mudou de assunto).
 */
export function isReactionLikelyIgnored(
  secondsSinceMedia: number | undefined,
  inboundText: string,
  mediaName: string
): boolean {
  if (secondsSinceMedia !== undefined && secondsSinceMedia > 3600) return true;
  const lowerIn = inboundText.toLowerCase();
  const lowerMedia = mediaName.toLowerCase();
  const keywords = lowerMedia.split(/\s+/).filter(w => w.length > 3);
  // Se nenhuma palavra relevante da mídia aparece na resposta E a resposta é curta, pode estar ignorando
  if (inboundText.length < 20 && keywords.length > 0) {
    const hits = keywords.filter(k => lowerIn.includes(k));
    if (hits.length === 0 && /^(oi|ola|olá|bom dia|boa tarde|boa noite|e ai)/i.test(inboundText.trim())) {
      return true;
    }
  }
  return false;
}

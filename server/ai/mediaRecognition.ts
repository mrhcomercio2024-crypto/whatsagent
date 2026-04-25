/**
 * Reconhecimento de áudio e imagem enviados pelo lead.
 *
 * - Áudio  → Whisper (`transcribeAudio`)  → texto transcrito
 * - Imagem → GPT-4 Vision via `invokeWithModel` → descrição visual curta
 * - Documento (PDF/imagem genérica) → tenta vision
 *
 * Cada chamada é registrada em `llm_usage` com purpose `transcription` ou
 * `vision`, para aparecer na aba Custos.
 */

import { transcribeAudio } from "../_core/voiceTranscription";
import { invokeWithModel } from "./invoke";
import { storagePut } from "../storage";
import { recordLlmUsage } from "../db";

export type RecognitionContext = {
  agentId: number;
  conversationId: number;
  leadId: number;
};

export type RecognitionResult = {
  ok: boolean;
  /** Texto que será injetado como turno do lead. */
  text: string;
  /** Tipo do conteúdo original. */
  kind: "audio" | "image" | "document" | "unknown";
  /** URL pública (se a mídia foi salva no storage). */
  storedUrl?: string;
  error?: string;
};

/**
 * Faz upload do buffer recebido para o storage e devolve URL pública.
 * Usado tanto para áudio (Whisper precisa de URL) quanto para imagem
 * (Vision precisa de URL).
 */
export async function uploadInboundMedia(
  buffer: Buffer,
  mimeType: string,
  context: RecognitionContext,
  ext: string
): Promise<{ key: string; url: string }> {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
  const key = `inbound/agent-${context.agentId}/lead-${context.leadId}/${Date.now()}.${safeExt}`;
  return storagePut(key, buffer, mimeType);
}

/**
 * Transcreve áudio recebido. Retorna texto pronto para entrar no contexto.
 */
export async function recognizeAudio(
  publicUrl: string,
  context: RecognitionContext
): Promise<RecognitionResult> {
  const result = await transcribeAudio({
    audioUrl: publicUrl,
    language: "pt",
    prompt: "Transcrição de mensagem de voz de um cliente em atendimento por WhatsApp.",
  });
  if ("error" in result) {
    return {
      ok: false,
      kind: "audio",
      text: "[O lead enviou um áudio que não foi possível transcrever]",
      storedUrl: publicUrl,
      error: result.error,
    };
  }

  // Custo aproximado do Whisper (USD 0.006 / minuto = 6 micro-USD * 60 = 360)
  // Calculamos por duração quando disponível.
  try {
    const minutes = Math.max(0.05, (result.duration || 60) / 60);
    const costMicroUsd = Math.round(minutes * 6000); // 6_000 micro-USD por minuto
    await recordLlmUsage({
      agentId: context.agentId,
      conversationId: context.conversationId,
      leadId: context.leadId,
      model: "whisper-1",
      purpose: "transcription",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costMicroUsd,
    });
  } catch (e) {
    console.warn("[transcription] failed to record usage:", e);
  }

  const transcription = (result.text || "").trim();
  return {
    ok: true,
    kind: "audio",
    text: transcription
      ? `[O lead enviou um áudio. Transcrição: "${transcription}"]`
      : "[O lead enviou um áudio vazio]",
    storedUrl: publicUrl,
  };
}

/**
 * Descreve uma imagem enviada pelo lead. Faz uma chamada de Vision objetiva
 * para extrair: o que a imagem mostra, texto visível (se houver), e
 * informação útil ao atendimento (ex.: comprovante, foto de produto, print).
 */
export async function recognizeImage(
  publicUrl: string,
  context: RecognitionContext
): Promise<RecognitionResult> {
  const visionModel = "gpt-4.1-mini"; // visão multimodal mais barata como default
  try {
    const { text } = await invokeWithModel({
      model: visionModel,
      messages: [
        {
          role: "system",
          content:
            "Você é um assistente que descreve imagens enviadas por clientes em uma conversa de WhatsApp. " +
            "Responda em UMA OU DUAS FRASES, em português, descrevendo objetivamente o que a imagem mostra. " +
            "Se houver texto visível (comprovante, captura de tela, documento), TRANSCREVA o texto principal entre aspas. " +
            "Não opine, não invente, apenas descreva o que vê.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Descreva esta imagem enviada pelo cliente:" },
            { type: "image_url", image_url: { url: publicUrl, detail: "auto" } },
          ],
        },
      ],
      maxTokens: 500,
      temperature: 0.2,
      tracking: {
        purpose: "vision",
        agentId: context.agentId,
        conversationId: context.conversationId,
        leadId: context.leadId,
      },
    });
    const description = (text || "").trim();
    return {
      ok: true,
      kind: "image",
      text: description
        ? `[O lead enviou uma imagem. Descrição: ${description}]`
        : "[O lead enviou uma imagem que não pôde ser descrita]",
      storedUrl: publicUrl,
    };
  } catch (e: any) {
    return {
      ok: false,
      kind: "image",
      text: "[O lead enviou uma imagem que não pôde ser interpretada]",
      storedUrl: publicUrl,
      error: e?.message || String(e),
    };
  }
}

/**
 * Roteador genérico: dado o mimeType, escolhe o tratamento adequado.
 */
export async function recognizeMedia(
  buffer: Buffer,
  mimeType: string,
  ext: string,
  context: RecognitionContext
): Promise<RecognitionResult> {
  const stored = await uploadInboundMedia(buffer, mimeType, context, ext);
  const url = absoluteStorageUrl(stored.url);

  if (mimeType.startsWith("audio/")) {
    return recognizeAudio(url, context);
  }
  if (mimeType.startsWith("image/")) {
    return recognizeImage(url, context);
  }
  // PDF e demais documentos: anexa link sem tentar OCR pesado
  return {
    ok: true,
    kind: "document",
    text: `[O lead enviou um documento (${mimeType}) — disponível em ${url}]`,
    storedUrl: url,
  };
}

/**
 * Storage retorna URL relativa /manus-storage/...; Whisper e Vision precisam
 * de URL absoluta para baixar. Resolvemos a partir do host público.
 */
export function absoluteStorageUrl(relativeOrAbsolute: string): string {
  if (/^https?:\/\//i.test(relativeOrAbsolute)) return relativeOrAbsolute;
  const base =
    process.env.PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    process.env.OAUTH_SERVER_URL ||
    "";
  if (!base) return relativeOrAbsolute;
  return `${base.replace(/\/+$/, "")}${relativeOrAbsolute}`;
}

/**
 * Wrapper sobre o helper invokeLLM do template para permitir
 * SELEÇÃO DE MODELO por chamada (cada etapa do script pode usar um modelo).
 *
 * O endpoint Forge aceita o campo `model` no payload OpenAI-compatível.
 * Se o modelo não for fornecido, cai no padrão do helper.
 */

import { ENV } from "../_core/env";
import type { Message, ResponseFormat } from "../_core/llm";
import { DEFAULT_LLM_MODEL } from "../../shared/llm-models";

export type InvokeWithModelParams = {
  model?: string;
  messages: Message[];
  responseFormat?: ResponseFormat;
  maxTokens?: number;
  temperature?: number;
};

const resolveApiUrl = () =>
  ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
    ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
    : "https://forge.manus.im/v1/chat/completions";

export async function invokeWithModel(params: InvokeWithModelParams): Promise<{
  text: string;
  raw: any;
}> {
  if (!ENV.forgeApiKey) throw new Error("LLM API key não configurada");

  const model = (params.model && params.model.trim()) || DEFAULT_LLM_MODEL;

  const payload: Record<string, unknown> = {
    model,
    messages: params.messages.map(m => ({
      role: m.role,
      content:
        typeof m.content === "string"
          ? m.content
          : Array.isArray(m.content)
          ? m.content
          : [m.content],
    })),
    max_tokens: params.maxTokens ?? 4096,
  };
  if (params.temperature !== undefined) payload.temperature = params.temperature;
  if (params.responseFormat) payload.response_format = params.responseFormat;

  const res = await fetch(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`LLM ${model} falhou: ${res.status} ${t}`);
  }
  const data = (await res.json()) as any;
  const content = data?.choices?.[0]?.message?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
      ? content
          .map((p: any) => (typeof p === "string" ? p : p?.text ?? ""))
          .join("")
      : "";
  return { text, raw: data };
}

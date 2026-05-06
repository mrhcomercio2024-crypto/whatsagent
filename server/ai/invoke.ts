/**
 * Wrapper sobre o helper invokeLLM do template para permitir
 * SELEÇÃO DE MODELO por chamada (cada etapa do script pode usar um modelo).
 *
 * Também grava cada chamada em llm_usage com tokens e custo calculado a
 * partir da tabela llm_prices (com fallback para os preços de referência
 * em server/ai/pricing.ts).
 */

import { ENV } from "../_core/env";
import type { Message, ResponseFormat } from "../_core/llm";
import { DEFAULT_LLM_MODEL } from "../../shared/llm-models";
import { computeCostMicroUsd, REFERENCE_PRICES } from "./pricing";
import { getLlmPrice, recordLlmUsage } from "../db";

export type InvokeWithModelParams = {
  model?: string;
  messages: Message[];
  responseFormat?: ResponseFormat;
  maxTokens?: number;
  temperature?: number;
  /** Contexto de cobrança — quando informado, grava em llm_usage. */
  tracking?: {
    purpose: "orchestrator" | "qualifier" | "followup" | "simulator" | "transcription" | "vision" | "validator" | "summary" | "status_classifier" | "intent_classifier" | "reaction_classifier" | "step_compliance" | "step_compliance_regen" | "lead_facts_extraction" | "other";
    agentId?: number;
    conversationId?: number;
    leadId?: number;
  };
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

  // Tracking de custos (best-effort — falhas são logadas, não propagam)
  if (params.tracking) {
    try {
      const usage = data?.usage || {};
      const promptTokens = Number(usage.prompt_tokens ?? 0);
      const completionTokens = Number(usage.completion_tokens ?? 0);
      const totalTokens = Number(usage.total_tokens ?? promptTokens + completionTokens);

      // Resolver preço (DB primeiro; fallback para tabela de referência)
      let inputPer1M = 0;
      let outputPer1M = 0;
      const dbPrice = await getLlmPrice(model).catch(() => undefined);
      if (dbPrice) {
        inputPer1M = dbPrice.inputPer1M;
        outputPer1M = dbPrice.outputPer1M;
      } else {
        const ref = REFERENCE_PRICES.find(p => p.model === model);
        if (ref) {
          inputPer1M = ref.inputPer1M;
          outputPer1M = ref.outputPer1M;
        }
      }
      const costMicroUsd = computeCostMicroUsd(
        promptTokens,
        completionTokens,
        inputPer1M,
        outputPer1M
      );

      await recordLlmUsage({
        agentId: params.tracking.agentId ?? null,
        conversationId: params.tracking.conversationId ?? null,
        leadId: params.tracking.leadId ?? null,
        model,
        purpose: params.tracking.purpose,
        promptTokens,
        completionTokens,
        totalTokens,
        costMicroUsd,
      });
    } catch (e) {
      console.warn("[llm-usage] failed to record usage:", e);
    }
  }

  return { text, raw: data };
}

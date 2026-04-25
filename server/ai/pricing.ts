/**
 * Tabela de preços de referência por modelo (USD por 1M tokens).
 * Usada como seed quando o usuário não editou nenhum preço.
 *
 * Os preços são armazenados como inteiros em micro-USD (USD * 1_000_000)
 * para evitar problemas de precisão de ponto flutuante.
 */

export type PriceRow = {
  model: string;
  inputPer1M: number; // micro-USD
  outputPer1M: number; // micro-USD
  notes?: string;
};

const usd = (v: number) => Math.round(v * 1_000_000);

export const REFERENCE_PRICES: PriceRow[] = [
  // OpenAI
  { model: "gpt-4.1", inputPer1M: usd(2.0), outputPer1M: usd(8.0), notes: "OpenAI GPT-4.1" },
  { model: "gpt-4.1-mini", inputPer1M: usd(0.4), outputPer1M: usd(1.6), notes: "OpenAI GPT-4.1 mini" },
  { model: "gpt-4.1-nano", inputPer1M: usd(0.1), outputPer1M: usd(0.4), notes: "OpenAI GPT-4.1 nano" },
  { model: "gpt-4o", inputPer1M: usd(2.5), outputPer1M: usd(10.0), notes: "OpenAI GPT-4o" },
  { model: "gpt-4o-mini", inputPer1M: usd(0.15), outputPer1M: usd(0.6), notes: "OpenAI GPT-4o mini" },
  { model: "o3-mini", inputPer1M: usd(1.1), outputPer1M: usd(4.4), notes: "OpenAI o3-mini" },
  { model: "o4-mini", inputPer1M: usd(1.1), outputPer1M: usd(4.4), notes: "OpenAI o4-mini" },

  // Anthropic
  {
    model: "claude-3-5-sonnet-latest",
    inputPer1M: usd(3.0),
    outputPer1M: usd(15.0),
    notes: "Claude 3.5 Sonnet",
  },
  {
    model: "claude-3-7-sonnet-latest",
    inputPer1M: usd(3.0),
    outputPer1M: usd(15.0),
    notes: "Claude 3.7 Sonnet",
  },
  {
    model: "claude-3-5-haiku-latest",
    inputPer1M: usd(0.8),
    outputPer1M: usd(4.0),
    notes: "Claude 3.5 Haiku",
  },
  {
    model: "claude-sonnet-4-20250514",
    inputPer1M: usd(3.0),
    outputPer1M: usd(15.0),
    notes: "Claude Sonnet 4",
  },
  {
    model: "claude-opus-4-20250514",
    inputPer1M: usd(15.0),
    outputPer1M: usd(75.0),
    notes: "Claude Opus 4",
  },

  // Google
  {
    model: "gemini-2.5-pro",
    inputPer1M: usd(1.25),
    outputPer1M: usd(10.0),
    notes: "Gemini 2.5 Pro",
  },
  {
    model: "gemini-2.5-flash",
    inputPer1M: usd(0.3),
    outputPer1M: usd(2.5),
    notes: "Gemini 2.5 Flash",
  },
  {
    model: "gemini-2.0-flash",
    inputPer1M: usd(0.1),
    outputPer1M: usd(0.4),
    notes: "Gemini 2.0 Flash",
  },
];

/**
 * Calcula custo em micro-USD a partir de tokens e preço.
 */
export function computeCostMicroUsd(
  promptTokens: number,
  completionTokens: number,
  inputPer1M: number,
  outputPer1M: number
): number {
  const input = (promptTokens * inputPer1M) / 1_000_000;
  const output = (completionTokens * outputPer1M) / 1_000_000;
  return Math.round(input + output);
}

/**
 * Estima custo a partir do nome do modelo, usando a tabela de referência
 * quando o usuário ainda não editou os preços. Para uso em testes/fallback.
 */
export function referenceCostMicroUsd(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const ref = REFERENCE_PRICES.find(p => p.model === model);
  if (!ref) return 0;
  return computeCostMicroUsd(
    promptTokens,
    completionTokens,
    ref.inputPer1M,
    ref.outputPer1M
  );
}

export const microUsdToUsd = (m: number) => m / 1_000_000;
export const formatUsd = (m: number) =>
  (m / 1_000_000).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  });

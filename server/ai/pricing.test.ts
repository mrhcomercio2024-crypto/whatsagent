import { describe, expect, it } from "vitest";
import {
  REFERENCE_PRICES,
  computeCostMicroUsd,
  referenceCostMicroUsd,
  microUsdToUsd,
  formatUsd,
} from "./pricing";

describe("pricing", () => {
  it("computeCostMicroUsd: zero tokens returns zero", () => {
    expect(computeCostMicroUsd(0, 0, 1_000_000, 2_000_000)).toBe(0);
  });

  it("computeCostMicroUsd: 1M input tokens at $1/1M = 1_000_000 micro USD", () => {
    expect(computeCostMicroUsd(1_000_000, 0, 1_000_000, 2_000_000)).toBe(1_000_000);
  });

  it("computeCostMicroUsd: 1M output tokens at $2/1M = 2_000_000 micro USD", () => {
    expect(computeCostMicroUsd(0, 1_000_000, 1_000_000, 2_000_000)).toBe(2_000_000);
  });

  it("computeCostMicroUsd: combina input e output corretamente", () => {
    // 500_000 input * $2/1M + 250_000 output * $8/1M
    // = 1.0 + 2.0 = 3.0 USD
    const cost = computeCostMicroUsd(500_000, 250_000, 2_000_000, 8_000_000);
    expect(cost).toBe(3_000_000);
  });

  it("computeCostMicroUsd: arredonda para inteiro", () => {
    // Pequena fração que não deve gerar float
    const cost = computeCostMicroUsd(1, 1, 1_000_000, 1_000_000);
    expect(Number.isInteger(cost)).toBe(true);
  });

  it("REFERENCE_PRICES: contém os principais modelos", () => {
    const models = REFERENCE_PRICES.map(p => p.model);
    expect(models).toContain("gpt-4.1");
    expect(models).toContain("gpt-4o-mini");
    expect(models).toContain("claude-3-5-sonnet-latest");
    expect(models).toContain("gemini-2.5-pro");
  });

  it("REFERENCE_PRICES: todos os preços são positivos", () => {
    for (const p of REFERENCE_PRICES) {
      expect(p.inputPer1M).toBeGreaterThan(0);
      expect(p.outputPer1M).toBeGreaterThan(0);
      // Output normalmente é maior que input
      expect(p.outputPer1M).toBeGreaterThanOrEqual(p.inputPer1M);
    }
  });

  it("referenceCostMicroUsd: gpt-4.1 com 1k input + 500 output", () => {
    // gpt-4.1: $2/1M input, $8/1M output
    // 1000 * 2 / 1M = 0.002 USD = 2_000 micro
    // 500 * 8 / 1M = 0.004 USD = 4_000 micro
    // total = 6_000 micro USD
    const cost = referenceCostMicroUsd("gpt-4.1", 1000, 500);
    expect(cost).toBe(6_000);
  });

  it("referenceCostMicroUsd: modelo desconhecido retorna 0", () => {
    expect(referenceCostMicroUsd("modelo-inexistente-xyz", 1000, 1000)).toBe(0);
  });

  it("microUsdToUsd: converte corretamente", () => {
    expect(microUsdToUsd(1_500_000)).toBe(1.5);
    expect(microUsdToUsd(0)).toBe(0);
  });

  it("formatUsd: formata como moeda USD", () => {
    const out = formatUsd(1_234_567);
    expect(out).toContain("$");
    expect(out).toContain("1.23");
  });

  it("custo realista: 100 chamadas de gpt-4o-mini com 800 in + 300 out", () => {
    // gpt-4o-mini: $0.15/1M in, $0.60/1M out
    // por chamada: 800*0.15/1M + 300*0.60/1M = 0.00012 + 0.00018 = 0.0003 USD = 300 micro
    const perCall = referenceCostMicroUsd("gpt-4o-mini", 800, 300);
    expect(perCall).toBe(300);
    expect(perCall * 100).toBe(30_000); // 100 chamadas = $0.03
  });
});

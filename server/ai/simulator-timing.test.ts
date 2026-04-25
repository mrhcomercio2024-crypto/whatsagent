/**
 * Testes para os cálculos de timing total reproduzidos pelo emulador
 * (debounce + typing por mensagem + pausa entre mensagens).
 *
 * O frontend reproduz exatamente o mesmo cálculo que `computeTypingDelayMs`
 * do servidor; aqui validamos:
 *   1. Cálculo determinístico para uma única ação;
 *   2. Cálculo agregado para múltiplas ações com pausas entre elas;
 *   3. Respeito ao toggle typingSimulationEnabled;
 *   4. Respeito ao debounce.
 */
import { describe, expect, it } from "vitest";
import { computeTypingDelayMs, nextProcessAt } from "./humanize";

const baseAgent = {
  typingSimulationEnabled: true,
  typingCps: 20,
  typingMinDelayMs: 500,
  typingMaxDelayMs: 6000,
  interMessageDelayMs: 1000,
  debounceSeconds: 8,
};

function totalDuration(
  agent: typeof baseAgent,
  actions: Array<{ length: number }>
) {
  let total = 0;
  for (let i = 0; i < actions.length; i++) {
    const ms = agent.typingSimulationEnabled
      ? computeTypingDelayMs(actions[i].length, agent)
      : 0;
    total += ms;
    if (i < actions.length - 1) total += agent.interMessageDelayMs;
  }
  return total;
}

describe("simulator timing", () => {
  it("respeita o mínimo quando o texto é muito curto", () => {
    expect(computeTypingDelayMs(2, baseAgent)).toBe(500);
  });

  it("escala com o tamanho do texto", () => {
    // 100 chars / 20 cps = 5000 ms (dentro do range 500..6000)
    expect(computeTypingDelayMs(100, baseAgent)).toBe(5000);
  });

  it("respeita o máximo quando o texto é muito longo", () => {
    expect(computeTypingDelayMs(10_000, baseAgent)).toBe(6000);
  });

  it("calcula a duração total do turno (3 mensagens com pausas)", () => {
    // 40, 100 e 200 chars
    const actions = [{ length: 40 }, { length: 100 }, { length: 200 }];
    // typing: 2000 + 5000 + 6000 (cap) = 13000
    // pausas: 1000 * 2 = 2000
    expect(totalDuration(baseAgent, actions)).toBe(15000);
  });

  it("zera typing quando simulação está desativada", () => {
    const off = { ...baseAgent, typingSimulationEnabled: false };
    const actions = [{ length: 40 }, { length: 100 }];
    // só fica a pausa entre mensagens
    expect(totalDuration(off, actions)).toBe(1000);
  });

  it("debounce agenda no futuro a quantidade configurada", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const at = nextProcessAt({ debounceSeconds: 12 }, now);
    expect(at.getTime() - now.getTime()).toBe(12_000);
  });
});

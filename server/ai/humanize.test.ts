import { describe, expect, it } from "vitest";
import {
  computeTypingDelayMs,
  nextProcessAt,
  pauseBetweenMessages,
  simulateTypingForMessage,
  sleep,
} from "./humanize";
import type { Agent } from "../../drizzle/schema";

function fakeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 1,
    name: "Test",
    description: null,
    status: "active",
    defaultLlmModel: "gpt-4.1",
    persona: null,
    language: "pt-BR",
    connectionMode: "official",
    debounceSeconds: 8,
    typingSimulationEnabled: true,
    typingCps: 20,
    typingMinDelayMs: 500,
    typingMaxDelayMs: 5000,
    interMessageDelayMs: 1000,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Agent;
}

describe("computeTypingDelayMs", () => {
  it("respeita o mínimo para mensagens curtas", () => {
    const agent = fakeAgent({ typingCps: 20, typingMinDelayMs: 800, typingMaxDelayMs: 5000 });
    // 5 chars / 20 cps = 250ms → cai no mínimo de 800
    expect(computeTypingDelayMs(5, agent)).toBe(800);
  });

  it("calcula proporcional para mensagens médias", () => {
    const agent = fakeAgent({ typingCps: 20, typingMinDelayMs: 0, typingMaxDelayMs: 60_000 });
    // 100 chars / 20 cps = 5000 ms
    expect(computeTypingDelayMs(100, agent)).toBe(5000);
  });

  it("respeita o máximo para mensagens longas", () => {
    const agent = fakeAgent({ typingCps: 20, typingMinDelayMs: 0, typingMaxDelayMs: 4000 });
    // 1000 chars / 20 cps = 50_000ms → cai no máximo
    expect(computeTypingDelayMs(1000, agent)).toBe(4000);
  });

  it("nunca divide por zero", () => {
    const agent = fakeAgent({ typingCps: 0, typingMinDelayMs: 0, typingMaxDelayMs: 60_000 });
    const v = computeTypingDelayMs(20, agent);
    expect(v).toBeGreaterThan(0);
  });
});

describe("nextProcessAt (debounce)", () => {
  it("soma os segundos configurados", () => {
    const agent = fakeAgent({ debounceSeconds: 12 });
    const base = new Date("2026-01-01T00:00:00Z");
    const at = nextProcessAt(agent, base);
    expect(at.getTime() - base.getTime()).toBe(12_000);
  });

  it("aceita 0 segundos (processa imediato)", () => {
    const agent = fakeAgent({ debounceSeconds: 0 });
    const base = new Date("2026-01-01T00:00:00Z");
    const at = nextProcessAt(agent, base);
    expect(at.getTime() - base.getTime()).toBe(0);
  });
});

describe("simulateTypingForMessage", () => {
  it("não chama setTyping quando simulação está desligada", async () => {
    let calls = 0;
    const agent = fakeAgent({ typingSimulationEnabled: false });
    await simulateTypingForMessage({
      agent,
      textLength: 100,
      setTyping: async () => {
        calls++;
      },
    });
    expect(calls).toBe(0);
  });

  it("liga e desliga typing exatamente uma vez", async () => {
    const states: Array<"on" | "off"> = [];
    const agent = fakeAgent({
      typingSimulationEnabled: true,
      typingCps: 1000,
      typingMinDelayMs: 0,
      typingMaxDelayMs: 50,
    });
    await simulateTypingForMessage({
      agent,
      textLength: 5,
      setTyping: async state => {
        states.push(state);
      },
    });
    expect(states).toEqual(["on", "off"]);
  });
});

describe("pauseBetweenMessages", () => {
  it("não bloqueia se interMessageDelayMs = 0", async () => {
    const start = Date.now();
    await pauseBetweenMessages({ interMessageDelayMs: 0 });
    expect(Date.now() - start).toBeLessThan(50);
  });
});

describe("sleep", () => {
  it("espera ~ms solicitado", async () => {
    const start = Date.now();
    await sleep(40);
    expect(Date.now() - start).toBeGreaterThanOrEqual(35);
  });
});

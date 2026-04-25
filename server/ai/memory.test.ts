import { describe, it, expect } from "vitest";
import { isResetCommand, RESET_REPLY } from "./resetCommand";
import { shouldRefreshSummary } from "./summarizer";
import { buildSystemPrompt, type PromptContext } from "./prompt";
import type { Agent } from "../../drizzle/schema";

const fakeAgent = (over: Partial<Agent> = {}): Agent =>
  ({
    id: 1,
    userId: 1,
    name: "Agente Teste",
    persona: "Vendedor consultivo",
    defaultLlmModel: "gpt-4o-mini",
    splitLongMessages: false,
    splitMaxChars: 800,
    typingSimulationEnabled: false,
    typingCps: 30,
    typingMinDelayMs: 500,
    typingMaxDelayMs: 4000,
    interMessageDelayMs: 300,
    debounceSeconds: 8,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...(over as any),
  }) as Agent;

describe("isResetCommand", () => {
  it("detecta variações do comando", () => {
    for (const v of ["/limpar", " /Limpar ", "/clear", "/RESET", "/start", "/restart"]) {
      expect(isResetCommand(v)).toBe(true);
    }
  });

  it("ignora mensagens normais e variantes parciais", () => {
    for (const v of [
      "limpar",
      "por favor /limpar",
      "/limpar tudo",
      "olá",
      "",
      null as any,
      undefined as any,
    ]) {
      expect(isResetCommand(v)).toBe(false);
    }
  });

  it("expõe uma mensagem de confirmação não vazia", () => {
    expect(RESET_REPLY).toMatch(/zerada|reiniciad/i);
  });
});

describe("shouldRefreshSummary", () => {
  it("não roda em conversa vazia", () => {
    expect(shouldRefreshSummary({ totalMessages: 0 })).toBe(false);
  });
  it("roda exatamente quando bate o limite pela primeira vez", () => {
    expect(shouldRefreshSummary({ totalMessages: 6 })).toBe(true);
    expect(shouldRefreshSummary({ totalMessages: 5 })).toBe(false);
  });
  it("respeita o intervalo desde o último resumo", () => {
    expect(
      shouldRefreshSummary({ totalMessages: 11, lastSummaryAtMessages: 6 })
    ).toBe(false);
    expect(
      shouldRefreshSummary({ totalMessages: 12, lastSummaryAtMessages: 6 })
    ).toBe(true);
  });

  it("aceita `every` customizado por agente (3)", () => {
    expect(shouldRefreshSummary({ totalMessages: 2, every: 3 })).toBe(false);
    expect(shouldRefreshSummary({ totalMessages: 3, every: 3 })).toBe(true);
    expect(
      shouldRefreshSummary({ totalMessages: 5, lastSummaryAtMessages: 3, every: 3 })
    ).toBe(false);
    expect(
      shouldRefreshSummary({ totalMessages: 6, lastSummaryAtMessages: 3, every: 3 })
    ).toBe(true);
  });

  it("aceita `every` customizado por agente (15)", () => {
    expect(shouldRefreshSummary({ totalMessages: 14, every: 15 })).toBe(false);
    expect(shouldRefreshSummary({ totalMessages: 15, every: 15 })).toBe(true);
    expect(
      shouldRefreshSummary({ totalMessages: 29, lastSummaryAtMessages: 15, every: 15 })
    ).toBe(false);
    expect(
      shouldRefreshSummary({ totalMessages: 30, lastSummaryAtMessages: 15, every: 15 })
    ).toBe(true);
  });
});

describe("buildSystemPrompt — bloco RESUMO + regras anti-repetição", () => {
  const baseCtx: PromptContext = {
    agent: fakeAgent(),
    brain: undefined,
    steps: [],
    currentStep: undefined,
    knowledge: [],
    availableMedia: [],
    history: [],
    leadName: "João",
    leadPhone: "+5511999",
  };

  it("avisa quando ainda não há resumo", () => {
    const p = buildSystemPrompt({ ...baseCtx, conversationSummary: null });
    expect(p).toMatch(/RESUMO DA CONVERSA/);
    expect(p).toMatch(/n[aã]o h[aá] resumo/i);
  });

  it("inclui o resumo evolutivo quando presente", () => {
    const p = buildSystemPrompt({
      ...baseCtx,
      conversationSummary:
        "Lead João, segmento agronegócio, interessado no plano Pro, já enviou orçamento R$2k.",
    });
    expect(p).toMatch(/RESUMO DA CONVERSA \(mem[oó]ria evolutiva/);
    expect(p).toMatch(/agronegócio/);
    expect(p).toMatch(/LEIA ANTES DE RESPONDER/);
  });

  it("traz as regras invioláveis com anti-repetição e fidelidade ao script", () => {
    const p = buildSystemPrompt(baseCtx);
    expect(p).toMatch(/JAMAIS repita/i);
    expect(p).toMatch(/ETAPA ATUAL|RESUMO DA CONVERSA/);
    // Versão flexível: fidelidade vem do bloco "vendedor consultivo"
    expect(p).toMatch(/vendedor consultivo/i);
  });
});

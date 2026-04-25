import { describe, it, expect } from "vitest";
import { buildSystemPrompt, type PromptContext } from "./prompt";
import type { Agent, Message as DbMessage } from "../../drizzle/schema";

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

const m = (
  body: string,
  direction: "inbound" | "outbound",
  sender: "lead" | "ai" | "human" = direction === "inbound" ? "lead" : "ai"
): DbMessage =>
  ({
    id: Math.random(),
    conversationId: 1,
    direction,
    sender,
    body,
    createdAt: new Date(),
  }) as any;

const baseCtx = (history: DbMessage[]): PromptContext => ({
  agent: fakeAgent(),
  brain: undefined,
  steps: [],
  currentStep: undefined,
  knowledge: [],
  availableMedia: [],
  history,
  leadName: "João",
  leadPhone: "+5511",
});

describe("buildSystemPrompt — bloco ÚLTIMA MENSAGEM DO LEAD", () => {
  it("destaca a última mensagem inbound literalmente", () => {
    const p = buildSystemPrompt(
      baseCtx([
        m("Quanto custa?", "inbound"),
        m("Custa X.", "outbound"),
        m("e o frete?", "inbound"),
      ])
    );
    expect(p).toMatch(/ÚLTIMA MENSAGEM DO LEAD/);
    expect(p).toMatch(/responda DIRETAMENTE a este texto/);
    // último inbound real é "e o frete?" (não "Quanto custa?")
    const idx = p.indexOf("ÚLTIMA MENSAGEM DO LEAD");
    expect(p.slice(idx)).toMatch(/e o frete\?/);
    expect(p.slice(idx)).not.toMatch(/Quanto custa\?/);
  });

  it("não inclui o bloco quando não há inbound no histórico", () => {
    const p = buildSystemPrompt(baseCtx([]));
    expect(p).not.toMatch(/ÚLTIMA MENSAGEM DO LEAD/);
  });

  it("ignora mensagens outbound e pega a última inbound real", () => {
    const p = buildSystemPrompt(
      baseCtx([
        m("primeira pergunta", "inbound"),
        m("ok, te explico", "outbound"),
        m("certo", "outbound"),
      ])
    );
    const idx = p.indexOf("ÚLTIMA MENSAGEM DO LEAD");
    expect(idx).toBeGreaterThan(0);
    expect(p.slice(idx)).toMatch(/primeira pergunta/);
  });
});

describe("heurística de resposta curta", () => {
  it("interpreta 'sim' como concordância e proíbe contradição", () => {
    const p = buildSystemPrompt(baseCtx([m("sim", "inbound")]));
    expect(p).toMatch(/INTERPRETAÇÃO: o lead CONCORDOU/);
    expect(p).toMatch(/NUNCA responda "não, não é bem assim"/);
  });

  it("interpreta 'ok' e 'beleza' como concordância", () => {
    expect(buildSystemPrompt(baseCtx([m("ok", "inbound")]))).toMatch(
      /CONCORDOU/
    );
    expect(buildSystemPrompt(baseCtx([m("beleza", "inbound")]))).toMatch(
      /CONCORDOU/
    );
  });

  it("interpreta 'não' curto como negação clara", () => {
    const p = buildSystemPrompt(baseCtx([m("não", "inbound")]));
    expect(p).toMatch(/disse NÃO de forma curta/);
  });

  it("interpreta pergunta curta com '?' adequadamente", () => {
    const p = buildSystemPrompt(baseCtx([m("quanto?", "inbound")]));
    expect(p).toMatch(/PERGUNTA curta. RESPONDA primeiro/);
  });

  it("não acusa concordância em frase longa", () => {
    const p = buildSystemPrompt(
      baseCtx([m("sim, mas eu queria entender melhor o investimento", "inbound")])
    );
    expect(p).not.toMatch(/INTERPRETAÇÃO: o lead CONCORDOU/);
  });

  it("não acusa nada em texto neutro", () => {
    const p = buildSystemPrompt(baseCtx([m("estou pensando", "inbound")]));
    expect(p).not.toMatch(/INTERPRETAÇÃO:/);
  });
});

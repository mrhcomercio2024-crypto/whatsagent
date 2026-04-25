import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  looksLikeStepLeak,
  type PromptContext,
} from "./prompt";
import type { Agent, ScriptStep } from "../../drizzle/schema";

const fakeAgent = (over: Partial<Agent> = {}): Agent =>
  ({
    id: 1,
    userId: 1,
    name: "Vendedor Premium",
    persona: "Consultor consultivo",
    defaultLlmModel: "gpt-4o-mini",
    splitLongMessages: false,
    splitMaxChars: 800,
    typingSimulationEnabled: false,
    typingCps: 30,
    typingMinDelayMs: 0,
    typingMaxDelayMs: 0,
    interMessageDelayMs: 0,
    debounceSeconds: 8,
    summaryEveryN: 6,
    summaryLlmModel: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...(over as any),
  }) as Agent;

const fakeStep = (over: Partial<ScriptStep> = {}): ScriptStep =>
  ({
    id: 10,
    agentId: 1,
    name: "Quebrar o gelo",
    instructions:
      "Cumprimente o lead, pergunte o nome dele e qual problema ele quer resolver.",
    completionCriteria: "O lead disse o nome e o problema.",
    order: 1,
    isMandatory: true,
    literalMode: false,
    literalText: null,
    llmModel: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...(over as any),
  }) as ScriptStep;

describe("looksLikeStepLeak", () => {
  const step = fakeStep();

  it("detecta prefixo 'Etapa:' / 'Objetivo:' / 'Vou'", () => {
    expect(looksLikeStepLeak("Etapa: cumprimentar o lead.", step)).toBeTruthy();
    expect(looksLikeStepLeak("Objetivo: descobrir o nome", step)).toBeTruthy();
    expect(
      looksLikeStepLeak("Vou agora seguir a etapa de quebrar o gelo.", step)
    ).toBeTruthy();
    expect(
      looksLikeStepLeak("Como agente, devo perguntar o nome.", step)
    ).toBeTruthy();
  });

  it("detecta listas numeradas estilo passos", () => {
    expect(
      looksLikeStepLeak(
        "Beleza, deixa eu seguir.\n1) cumprimento\n2) pergunto o nome\n3) ofereço",
        step
      )
    ).toBeTruthy();
  });

  it("detecta repetição literal das instruções da etapa", () => {
    const out =
      "Cumprimente o lead, pergunte o nome dele e qual problema ele quer resolver.";
    expect(looksLikeStepLeak(out, step)).toBeTruthy();
  });

  it("detecta título markdown e bullets", () => {
    expect(looksLikeStepLeak("## Próxima ação\nOlá!", step)).toBeTruthy();
    expect(
      looksLikeStepLeak("- pergunta nome\n- pergunta problema", step)
    ).toBeTruthy();
  });

  it("aceita uma resposta humana e curta", () => {
    expect(
      looksLikeStepLeak("Oi! Aqui é o João da Acme. Qual seu nome?", step)
    ).toBeNull();
    expect(
      looksLikeStepLeak("Bom dia! Posso te chamar pelo nome?", step)
    ).toBeNull();
  });

  it("ignora respostas vazias", () => {
    expect(looksLikeStepLeak("", step)).toBeNull();
    expect(looksLikeStepLeak("   ", step)).toBeNull();
  });
});

describe("buildSystemPrompt — etapa como diretiva interna", () => {
  const baseCtx: PromptContext = {
    agent: fakeAgent(),
    brain: undefined,
    steps: [fakeStep(), fakeStep({ id: 11, name: "Apresentar oferta", order: 2 })],
    currentStep: fakeStep(),
    knowledge: [],
    availableMedia: [],
    history: [],
    leadName: "Maria",
    leadPhone: "+5511",
  };

  it("marca a etapa como diretiva interna e proíbe vazamento", () => {
    const p = buildSystemPrompt(baseCtx);
    expect(p).toMatch(/DIRETIVA INTERNA/);
    expect(p).toMatch(/uso interno/);
    expect(p).toMatch(/NÃO escreva "Objetivo"/);
    // Funil deve aparecer só como esqueleto (só nomes, sem o texto das instruções)
    expect(p).toMatch(/FUNIL DE ATENDIMENTO/);
    const funilStart = p.indexOf("FUNIL DE ATENDIMENTO");
    const etapaStart = p.indexOf("ETAPA ATUAL");
    expect(funilStart).toBeGreaterThan(0);
    expect(etapaStart).toBeGreaterThan(funilStart);
    const funilSection = p.slice(funilStart, etapaStart);
    expect(funilSection).not.toMatch(/Cumprimente o lead/);
    // A diretiva da etapa atual existe no prompt, mas só dentro do bloco DIRETIVA INTERNA
    expect(p).toMatch(/Cumprimente o lead/);
  });

  it("respeita o modo literal e instrui envio sem reescrita", () => {
    const literalStep = fakeStep({
      literalMode: true,
      literalText: "Olá! Tudo bem? Sou a Ana da Acme.",
    });
    const p = buildSystemPrompt({ ...baseCtx, currentStep: literalStep });
    expect(p).toMatch(/modo literal/);
    expect(p).toMatch(/Olá! Tudo bem\? Sou a Ana da Acme\./);
    expect(p).toMatch(/sem reescrever/);
  });

  it("traz as regras invioláveis novas (anti-vazamento, formato curto)", () => {
    const p = buildSystemPrompt(baseCtx);
    expect(p).toMatch(/ESCREVA APENAS A PRÓXIMA MENSAGEM/);
    expect(p).toMatch(/NÃO REPITA/);
    expect(p).toMatch(/sem listas numeradas/);
  });
});

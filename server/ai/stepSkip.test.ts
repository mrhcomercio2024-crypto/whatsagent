import { describe, it, expect } from "vitest";
import { canAdvanceStep, looksLikeStepSkip, extractKeywords } from "./stepSkip";
import { buildSystemPrompt } from "./prompt";

const stepGreet = {
  id: 1,
  orderIndex: 1,
  name: "Cumprimentar",
  instructions: "Cumprimente o lead pelo nome e pergunte como pode ajudar hoje.",
};
const stepExplain = {
  id: 2,
  orderIndex: 2,
  name: "Explicar produto",
  instructions:
    "Explique como o produto funciona, fale do catálogo, da plataforma e da logística de envio.",
};
const stepClose = {
  id: 3,
  orderIndex: 3,
  name: "Investimento",
  instructions:
    "Apresente investimento, preços, condições de pagamento e fechamento da venda.",
};
const allSteps = [stepGreet, stepExplain, stepClose];

describe("extractKeywords", () => {
  it("ignora stopwords e palavras curtas", () => {
    const kw = extractKeywords("Como você pode pagar a entrada do produto");
    expect(kw.has("produto")).toBe(true);
    expect(kw.has("entrada")).toBe(true);
    expect(kw.has("voce")).toBe(false);
  });
});

describe("looksLikeStepSkip", () => {
  it("permite resposta natural na etapa Cumprimentar", () => {
    const r = looksLikeStepSkip(
      "Oi! Tudo bem? Posso saber seu nome?",
      stepGreet,
      allSteps,
      true
    );
    expect(r.skipped).toBe(false);
  });

  it("detecta antecipação de Explicar produto na etapa Cumprimentar", () => {
    const text =
      "Vou te explicar como o produto funciona, temos um catálogo enorme e cuidamos da logística e da plataforma para você.";
    const r = looksLikeStepSkip(text, stepGreet, allSteps, true);
    expect(r.skipped).toBe(true);
    expect(r.jumpedTo).toBe("Explicar produto");
  });

  it("detecta antecipação de Investimento (preços) ainda na Cumprimentar", () => {
    const text =
      "Posso te passar agora os preços e as condições de pagamento, é tranquilo de fechar venda.";
    const r = looksLikeStepSkip(text, stepGreet, allSteps, true);
    expect(r.skipped).toBe(true);
  });

  it("não acusa skip se já estamos na última etapa", () => {
    const r = looksLikeStepSkip(
      "Posso te passar o link de pagamento agora.",
      stepClose,
      allSteps,
      false
    );
    expect(r.skipped).toBe(false);
  });

  it("é menos rígido fora do primeiro turno (margem maior)", () => {
    // 1 hit de futura, 0 da atual: no firstTurn dispararia (margem 1), fora não (margem 2)
    const text = "Quanto à entrega, te explico melhor depois.";
    const r1 = looksLikeStepSkip(text, stepGreet, allSteps, true);
    const r2 = looksLikeStepSkip(text, stepGreet, allSteps, false);
    expect(r1.skipped || !r2.skipped).toBe(true);
  });
});

describe("canAdvanceStep", () => {
  it("nunca avança no primeiro turno", () => {
    expect(
      canAdvanceStep({ parsedAdvance: true, isFirstTurn: true, inboundCountInStep: 5 })
    ).toBe(false);
  });
  it("não avança se IA não emitiu STEP_ADVANCE", () => {
    expect(
      canAdvanceStep({ parsedAdvance: false, isFirstTurn: false, inboundCountInStep: 3 })
    ).toBe(false);
  });
  it("avança quando há advance, não é primeiro turno e há inbound", () => {
    expect(
      canAdvanceStep({ parsedAdvance: true, isFirstTurn: false, inboundCountInStep: 1 })
    ).toBe(true);
  });
  it("não avança se nenhum inbound real ainda existe", () => {
    expect(
      canAdvanceStep({ parsedAdvance: true, isFirstTurn: false, inboundCountInStep: 0 })
    ).toBe(false);
  });
});

describe("prompt: regra dura de não antecipar etapas", () => {
  const baseAgent: any = { id: 1, name: "Vendedor", persona: "Vendedor humano." };
  const baseCtx: any = {
    agent: baseAgent,
    brain: { masterPrompt: "Seja gentil." },
    steps: allSteps,
    currentStep: stepGreet,
    knowledge: [],
    availableMedia: [],
    history: [],
    leadName: null,
    leadPhone: null,
  };

  it("inclui regra de não antecipar etapas seguintes", () => {
    const sys = buildSystemPrompt(baseCtx);
    expect(sys).toMatch(/NUNCA antecipe conte[uú]do de etapas seguintes/i);
  });

  it("menciona o nome da próxima etapa para reforçar bloqueio", () => {
    const sys = buildSystemPrompt(baseCtx);
    expect(sys).toMatch(/A pr[oó]xima etapa se chama "Explicar produto"/i);
  });

  it("inclui regra explícita de NUNCA STEP_ADVANCE no primeiro turno", () => {
    const sys = buildSystemPrompt(baseCtx);
    expect(sys).toMatch(/NUNCA inclua \[STEP_ADVANCE\] no primeiro turno/i);
  });

  it("informa o número da etapa atual e o total", () => {
    const sys = buildSystemPrompt(baseCtx);
    expect(sys).toMatch(/etapa 1 de 3: "Cumprimentar"/i);
  });
});

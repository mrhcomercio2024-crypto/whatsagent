import { describe, it, expect } from "vitest";
import {
  canAdvanceStep,
  looksLikeStepSkip,
  extractKeywords,
  leadAskedQuestion,
} from "./stepSkip";
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
    const r = looksLikeStepSkip(text, stepGreet, allSteps, { firstTurn: true });
    expect(r.skipped).toBe(true);
    expect(r.jumpedTo).toBe("Explicar produto");
  });

  it("detecta antecipação de Investimento (preços) ainda na Cumprimentar", () => {
    const text =
      "Posso te passar agora os preços e as condições de pagamento, é tranquilo fechar a venda no fechamento.";
    const r = looksLikeStepSkip(text, stepGreet, allSteps, { firstTurn: true });
    expect(r.skipped).toBe(true);
  });

  it("NUNCA acusa skip quando já há 2+ inbounds (conversa andando)", () => {
    const text =
      "Vou te explicar como o produto funciona, temos um catálogo enorme.";
    const r = looksLikeStepSkip(text, stepGreet, allSteps, {
      firstTurn: false,
      inboundCount: 3,
    });
    expect(r.skipped).toBe(false);
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

  it("não acusa skip por uma palavra solta tipo 'entrega' fora de primeiro turno", () => {
    const text = "Beleza, te entendi. Por que tipo de produto você se interessa?";
    const r = looksLikeStepSkip(text, stepGreet, allSteps, {
      firstTurn: false,
      inboundCount: 1,
    });
    expect(r.skipped).toBe(false);
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

  it("inclui regra de prioridade máxima — responder à última pergunta do lead", () => {
    const sys = buildSystemPrompt(baseCtx);
    expect(sys).toMatch(/PRIORIDADE M[AÁ]XIMA: responda DIRETAMENTE/i);
  });

  it("menciona o nome da próxima etapa para reforçar contexto", () => {
    const sys = buildSystemPrompt(baseCtx);
    expect(sys).toMatch(/Pr[oó]xima etapa: "Explicar produto"/i);
  });

  it("inclui regra explícita de NUNCA STEP_ADVANCE no primeiro turno", () => {
    const sys = buildSystemPrompt(baseCtx);
    expect(sys).toMatch(/NUNCA inclua \[STEP_ADVANCE\] no primeiro turno/i);
  });

  it("informa o número da etapa atual e o total + obrigatória/opcional", () => {
    const sys = buildSystemPrompt(baseCtx);
    expect(sys).toMatch(/etapa 1 de 3: "Cumprimentar"/i);
  });

  it("inclui o tom de vendedor consultivo flexível", () => {
    const sys = buildSystemPrompt(baseCtx);
    expect(sys).toMatch(/vendedor consultivo/i);
    expect(sys).toMatch(/etapas s[aã]o OBJETIVOS a cumprir/i);
  });
});

describe("leadAskedQuestion", () => {
  it("detecta interrogação explícita", () => {
    expect(leadAskedQuestion("quanto custa isso?")).toBe(true);
  });
  it("detecta termo interrogativo sem ?", () => {
    expect(leadAskedQuestion("como funciona o produto")).toBe(true);
  });
  it("não acusa em afirmação neutra", () => {
    expect(leadAskedQuestion("to comecando do zero")).toBe(false);
  });
  it("trata texto vazio", () => {
    expect(leadAskedQuestion("")).toBe(false);
    expect(leadAskedQuestion(null)).toBe(false);
  });
});

describe("looksLikeStepSkip + leadAskedQuestion (vendedor flexível)", () => {
  it("libera resposta sobre 'preco' quando o lead perguntou diretamente", () => {
    const text =
      "O investimento começa em X. Você já vende online ou está começando agora?";
    const r = looksLikeStepSkip(text, stepGreet, allSteps, {
      firstTurn: false,
      inboundCount: 1,
      leadAskedQuestion: true,
    });
    expect(r.skipped).toBe(false);
  });

  it("continua bloqueando antecipação quando o lead NÃO perguntou", () => {
    const text =
      "Vou te explicar como o produto funciona, temos um catálogo enorme e cuidamos da logística.";
    const r = looksLikeStepSkip(text, stepGreet, allSteps, {
      firstTurn: false,
      inboundCount: 1,
      leadAskedQuestion: false,
    });
    expect(r.skipped).toBe(true);
  });
});

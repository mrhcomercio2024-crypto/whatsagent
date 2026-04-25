import { describe, it, expect } from "vitest";
import { buildSystemPrompt, parseAgentOutput } from "./prompt";

/**
 * Cobertura para o cenário "agente sem etapas" + safety net contra
 * actions vazias. Esses testes garantem que:
 *  - buildSystemPrompt funciona quando steps=[] e currentStep=undefined
 *    (não quebra, não enche o prompt de "etapa 1 de undefined")
 *  - parseAgentOutput devolve cleanText vazio quando o LLM responde só
 *    com marcações ou string vazia (esse era o caminho que levava ao
 *    "Sem resposta — verifique cérebro/etapas")
 */

describe("buildSystemPrompt sem etapas", () => {
  const baseAgent: any = {
    id: 1,
    name: "Ravi",
    persona: "Vendedor consultivo",
    defaultLlmModel: "gpt-4o-mini",
  };
  const baseBrain: any = {
    masterPrompt: "Você é o Ravi, vendedor da WeDrop.",
    rules: "Nunca fale de comprovante antes do pagamento.",
    tone: "Casual mas profissional",
    products: "WeDrop oferece acesso vitalício.",
    objections: "Caro: explique valor.",
    companyInfo: "WeDrop SP.",
  };

  it("não quebra quando steps=[] e currentStep=undefined", () => {
    const prompt = buildSystemPrompt({
      agent: baseAgent,
      brain: baseBrain,
      steps: [],
      currentStep: undefined,
      knowledge: [],
      availableMedia: [],
      history: [],
      leadName: null,
      leadPhone: null,
      conversationSummary: null,
    });
    expect(prompt).toContain("ETAPA ATUAL");
    expect(prompt).toContain("nenhuma etapa configurada");
    expect(prompt).toContain("Ravi");
    expect(prompt).toContain("WeDrop");
    // Não deve referenciar "etapa 1 de undefined" ou similar
    expect(prompt).not.toMatch(/etapa\s+\?\s+de\s+0/i);
  });

  it("inclui o cérebro completo quando não há etapas", () => {
    const prompt = buildSystemPrompt({
      agent: baseAgent,
      brain: baseBrain,
      steps: [],
      currentStep: undefined,
      knowledge: [],
      availableMedia: [],
      history: [],
    });
    expect(prompt).toContain("Você é o Ravi, vendedor da WeDrop.");
    expect(prompt).toContain("Nunca fale de comprovante antes do pagamento.");
  });

  it("ainda renderiza o bloco ÚLTIMA MENSAGEM DO LEAD sem etapas", () => {
    const prompt = buildSystemPrompt({
      agent: baseAgent,
      brain: baseBrain,
      steps: [],
      currentStep: undefined,
      knowledge: [],
      availableMedia: [],
      history: [
        {
          id: 1,
          conversationId: 1,
          direction: "inbound",
          sender: "lead",
          contentType: "text",
          body: "tenho que pagar pra vender pra vocês?",
        } as any,
      ],
    });
    expect(prompt).toContain("ÚLTIMA MENSAGEM DO LEAD");
    expect(prompt).toContain("tenho que pagar pra vender pra vocês?");
  });
});

describe("parseAgentOutput cobre casos de cleanText vazio", () => {
  it("devolve cleanText vazio quando entrada é vazia", () => {
    const r = parseAgentOutput("");
    expect(r.cleanText).toBe("");
    expect(r.mediaIds).toEqual([]);
    expect(r.stepAdvance).toBe(false);
    expect(r.handoff).toBe(false);
  });

  it("devolve cleanText vazio quando o LLM responde só com marcações", () => {
    const r = parseAgentOutput("[STEP_ADVANCE]");
    expect(r.cleanText.trim()).toBe("");
    expect(r.stepAdvance).toBe(true);
  });

  it("preserva o texto quando há mistura de texto + marcação", () => {
    const r = parseAgentOutput("Beleza, vamos seguir! [STEP_ADVANCE]");
    expect(r.cleanText).toContain("Beleza");
    expect(r.stepAdvance).toBe(true);
  });
});

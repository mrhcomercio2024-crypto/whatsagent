import { describe, it, expect } from "vitest";
import {
  classifyQuestion,
  leadQuestionUnaddressed,
  answerLooksSubstantive,
} from "./questionGuard";

describe("classifyQuestion", () => {
  it("classifica perguntas sobre preço", () => {
    expect(classifyQuestion("Quanto custa?")).toBe("price");
    expect(classifyQuestion("qual o valor do plano?")).toBe("price");
    expect(classifyQuestion("preço?")).toBe("price");
  });
  it("classifica perguntas sobre como funciona", () => {
    expect(classifyQuestion("como funciona?")).toBe("how_works");
  });
  it("classifica garantia", () => {
    expect(classifyQuestion("tem garantia?")).toBe("guarantee");
  });
  it("classifica catálogo", () => {
    expect(classifyQuestion("quais produtos vocês têm?")).toBe("catalog");
  });
  it("retorna none para texto sem pergunta", () => {
    expect(classifyQuestion("ok, obrigado")).toBe("none");
  });
});

describe("answerLooksSubstantive", () => {
  it("aceita resposta de preço com R$/valor", () => {
    expect(answerLooksSubstantive("price", "O plano custa R$ 297 por mês.")).toBe(true);
  });
  it("rejeita resposta vazia para preço", () => {
    expect(answerLooksSubstantive("price", "Posso te perguntar uma coisa?")).toBe(false);
  });
  it("aceita resposta de garantia mencionando dias", () => {
    expect(answerLooksSubstantive("guarantee", "Sim, temos 7 dias de garantia.")).toBe(true);
  });
});

describe("leadQuestionUnaddressed", () => {
  it("flagra quando lead pergunta preço e IA só faz outra pergunta", () => {
    const r = leadQuestionUnaddressed({
      inboundText: "quanto custa?",
      aiText: "Posso te perguntar o que mais te chamou atenção?",
    });
    expect(r.unaddressed).toBe(true);
    expect(r.category).toBe("price");
  });

  it("não flagra quando IA responde objetivamente", () => {
    const r = leadQuestionUnaddressed({
      inboundText: "quanto custa?",
      aiText: "O plano custa R$ 297 por mês. Posso te explicar o que está incluído?",
    });
    expect(r.unaddressed).toBe(false);
  });

  it("não flagra quando inbound não é pergunta", () => {
    const r = leadQuestionUnaddressed({
      inboundText: "ok",
      aiText: "Perfeito.",
    });
    expect(r.unaddressed).toBe(false);
  });
});

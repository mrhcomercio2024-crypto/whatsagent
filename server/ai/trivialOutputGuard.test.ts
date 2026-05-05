import { describe, it, expect } from "vitest";
import { isTrivialGreeting, isTrivialOutputInContext } from "./trivialOutputGuard";

describe("isTrivialGreeting", () => {
  it("detecta saudações isoladas em PT-BR", () => {
    for (const v of [
      "Boa tarde!",
      "boa tarde",
      "Boa Tarde !",
      "bom dia",
      "Boa noite",
      "Olá!",
      "Oi",
      "Ola",
      "ei",
      "salve!",
      "opa.",
      "Tudo bem?",
      "como vai?",
    ]) {
      expect(isTrivialGreeting(v)).toBe(true);
    }
  });

  it("não trivializa frases com conteúdo real", () => {
    for (const v of [
      "Boa tarde, pode me dizer seu nome?",
      "Olá, como funciona o produto?",
      "Boa tarde! Tenho um vídeo pra te mostrar.",
      "Bom dia. Qual sua dúvida?",
      "Sim",
      "Não obrigado",
      "Posso te ajudar com algo?",
    ]) {
      expect(isTrivialGreeting(v)).toBe(false);
    }
  });

  it("vazio e nulo não são considerados saudação (impl: retorna false)", () => {
    // A impl retorna false para vazios; o tratamento de "vazio = suprimir"
    // é feito no orchestrator (SAFETY NET checa aiOutput.trim() === '').
    expect(isTrivialGreeting("")).toBe(false);
    expect(isTrivialGreeting(null)).toBe(false);
    expect(isTrivialGreeting(undefined)).toBe(false);
    expect(isTrivialGreeting("   ")).toBe(false);
  });
});

describe("isTrivialOutputInContext", () => {
  it("permite saudação no PRIMEIRO turno da IA", () => {
    expect(
      isTrivialOutputInContext({
        cleanText: "Boa tarde!",
        hasMediaActions: false,
        isFirstAiTurn: true,
      })
    ).toBe(false);
  });

  it("BLOQUEIA saudação isolada em turnos subsequentes (greeting loop)", () => {
    expect(
      isTrivialOutputInContext({
        cleanText: "Boa tarde!",
        hasMediaActions: false,
        isFirstAiTurn: false,
      })
    ).toBe(true);
  });

  it("não bloqueia saudação se há mídia anexa", () => {
    expect(
      isTrivialOutputInContext({
        cleanText: "Boa tarde!",
        hasMediaActions: true,
        isFirstAiTurn: false,
      })
    ).toBe(false);
  });

  it("não bloqueia respostas substantivas", () => {
    expect(
      isTrivialOutputInContext({
        cleanText: "Posso te explicar como funciona o produto.",
        hasMediaActions: false,
        isFirstAiTurn: false,
      })
    ).toBe(false);
  });
});

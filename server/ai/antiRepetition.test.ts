import { describe, it, expect } from "vitest";
import { detectRepetition } from "./antiRepetition";

describe("detectRepetition", () => {
  it("detecta repetição exata após normalização", () => {
    const r = detectRepetition("Olá, tudo bem?", ["olá tudo bem!"]);
    expect(r.repeats).toBe(true);
    expect(r.reason).toBe("exact");
  });

  it("detecta paráfrase forte como near-repetição", () => {
    const last = "Posso te perguntar uma coisa rapidinho pra te ajudar melhor?";
    const candidate = "Posso te fazer uma pergunta rapidinho pra te ajudar melhor?";
    const r = detectRepetition(candidate, [last]);
    expect(r.repeats).toBe(true);
  });

  it("não bloqueia respostas com conteúdo distinto", () => {
    const last = "Quanto você está investindo hoje em tráfego?";
    const candidate = "Perfeito. O plano profissional inclui suporte e custa R$ 297 por mês.";
    const r = detectRepetition(candidate, [last]);
    expect(r.repeats).toBe(false);
  });

  it("compara contra as últimas 3 e dispara se a 2ª anterior bater", () => {
    const candidate = "Olá, tudo bem?";
    const lastThree = [
      "Quanto você fatura por mês hoje?",
      "Olá tudo bem!",
      "Pode me dizer seu nome?",
    ];
    const r = detectRepetition(candidate, lastThree);
    expect(r.repeats).toBe(true);
  });

  it("retorna false para histórico vazio", () => {
    const r = detectRepetition("Qualquer coisa", []);
    expect(r.repeats).toBe(false);
  });
});

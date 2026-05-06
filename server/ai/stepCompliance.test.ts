import { describe, it, expect } from "vitest";
import { checkHeuristic, buildRegenHint, type StepInfo } from "./stepCompliance";

const baseStep: StepInfo = {
  id: 1,
  name: "Qualificação",
  objective: "Descobrir renda mensal e ocupação do lead",
  mustAsk: JSON.stringify(["Quanto você ganha hoje?", "Você é CLT ou autônomo?"]),
  mustNotSay: JSON.stringify(["empréstimo", "garantido"]),
  successSignals: JSON.stringify(["renda", "ocupação"]),
};

describe("stepCompliance.checkHeuristic", () => {
  it("reprova resposta vazia", () => {
    const r = checkHeuristic("", baseStep);
    expect(r.passed).toBe(false);
    expect(r.layer).toBe("heuristic");
  });

  it("reprova resposta curta demais (<5 chars)", () => {
    const r = checkHeuristic("oi", baseStep);
    expect(r.passed).toBe(false);
  });

  it("reprova resposta genérica isolada", () => {
    const r = checkHeuristic("Perfeito", baseStep);
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/genérica/i);
  });

  it("reprova quando contém termo de mustNotSay", () => {
    const r = checkHeuristic(
      "Posso te oferecer um empréstimo agora mesmo, quanto você ganha?",
      baseStep
    );
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/empréstimo/i);
  });

  it("reprova quando mustAsk existe mas resposta não tem pergunta nem successSignal", () => {
    const r = checkHeuristic(
      "Legal, fico feliz por isso. Vou te explicar mais sobre nossa empresa em seguida.",
      baseStep
    );
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/must_ask|sucesso/i);
  });

  it("aprova quando contém pergunta", () => {
    const r = checkHeuristic("Show! E qual a sua renda mensal hoje?", baseStep);
    expect(r.passed).toBe(true);
  });

  it("aprova quando contém successSignal mesmo sem pergunta", () => {
    const r = checkHeuristic("Anotado: você tem renda variável.", baseStep);
    expect(r.passed).toBe(true);
  });

  it("aprova step sem mustAsk", () => {
    const stepNoAsk: StepInfo = { ...baseStep, mustAsk: null, successSignals: null };
    const r = checkHeuristic("Vou te explicar como funciona o produto.", stepNoAsk);
    expect(r.passed).toBe(true);
  });
});

describe("stepCompliance.buildRegenHint", () => {
  it("inclui motivo, objetivo, fala do lead e mustAsk", () => {
    const hint = buildRegenHint(
      { passed: false, reason: "resposta vazia", layer: "heuristic" },
      baseStep,
      "ganho 3 mil por mês"
    );
    expect(hint).toMatch(/PROBLEMA NA RESPOSTA/);
    expect(hint).toMatch(/OBJETIVO/);
    expect(hint).toMatch(/3 mil/);
    expect(hint).toMatch(/Quanto você ganha/);
  });

  it("não trava sem mustAsk", () => {
    const stepNoAsk: StepInfo = { ...baseStep, mustAsk: null };
    const hint = buildRegenHint(
      { passed: false, reason: "vazio", layer: "heuristic" },
      stepNoAsk,
      ""
    );
    expect(hint).toMatch(/PROBLEMA/);
    expect(hint).not.toMatch(/Quanto você ganha/);
  });
});

describe("checkHeuristic — afrouxamento natural (Fase 88)", () => {
  it("aceita 'Beleza' isolado quando lead respondeu 'sim'", () => {
    const r = checkHeuristic(
      "Beleza",
      { id: 1, name: "ack", mustAsk: null } as any,
      { lastLeadText: "sim" }
    );
    expect(r.passed).toBe(true);
  });

  it("rejeita 'Beleza' isolado quando lead fez pergunta substantiva", () => {
    const r = checkHeuristic(
      "Beleza",
      { id: 1, name: "x", mustAsk: null } as any,
      { lastLeadText: "Quanto custa o produto?" }
    );
    expect(r.passed).toBe(false);
  });

  it("rejeita resposta com formalismo quando preset é natural", () => {
    const r = checkHeuristic(
      "Prezado cliente, conforme mencionado anteriormente, segue a proposta detalhada.",
      { id: 1, name: "x", mustAsk: null } as any,
      { toneProfile: "natural" }
    );
    expect(r.passed).toBe(false);
    expect(r.reason || "").toMatch(/rob|formal/);
  });

  it("aceita resposta natural com gírias quando preset é natural", () => {
    const r = checkHeuristic(
      "Saquei. E me conta, quanto cê tá pensando em investir por mês?",
      { id: 1, name: "x", mustAsk: null } as any,
      { toneProfile: "natural" }
    );
    expect(r.passed).toBe(true);
  });

  it("aceita resposta formal quando preset é rigid", () => {
    const r = checkHeuristic(
      "Prezado, segue resposta detalhada com todos os pontos solicitados pelo senhor.",
      { id: 1, name: "x", mustAsk: null } as any,
      { toneProfile: "rigid" }
    );
    expect(r.passed).toBe(true);
  });
});

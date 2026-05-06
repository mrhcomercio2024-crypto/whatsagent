import { describe, it, expect } from "vitest";
import { renderFactsForPrompt, type LeadFacts } from "./leadFactsExtractor";

describe("renderFactsForPrompt", () => {
  it("retorna string vazia quando facts vazio", () => {
    expect(renderFactsForPrompt({})).toBe("");
  });

  it("ignora valores nulos/undefined/string vazia", () => {
    const facts = {
      nome: "",
      idade: null as unknown as number,
      cidade: undefined,
    } as LeadFacts;
    expect(renderFactsForPrompt(facts)).toBe("");
  });

  it("renderiza chaves preenchidas como bullets", () => {
    const facts: LeadFacts = {
      ocupacao_atual: "clt",
      renda_mensal_brl: 3000,
    } as LeadFacts;
    const out = renderFactsForPrompt(facts);
    expect(out).toMatch(/FATOS CONHECIDOS DO LEAD/);
    expect(out).toMatch(/ocupacao_atual: clt/);
    expect(out).toMatch(/renda_mensal_brl: 3000/);
  });

  it("renderiza arrays como vírgula-separados", () => {
    const facts = { dores: ["dívida", "ansiedade"] } as unknown as LeadFacts;
    const out = renderFactsForPrompt(facts);
    expect(out).toMatch(/dores: dívida, ansiedade/);
  });
});

import { describe, it, expect } from "vitest";
import {
  findRestrictedHits,
  maskRestrictedTerms,
} from "./prompt";

describe("findRestrictedHits", () => {
  it("encontra termo case-insensitive e sem acentos", () => {
    const hits = findRestrictedHits("Esse plano é GARANTIDO e o melhor do mercado.", [
      { term: "garantido", action: "block" },
      { term: "melhor do mercado", action: "rewrite" },
    ]);
    expect(hits.map(h => h.term).sort()).toEqual(
      ["garantido", "melhor do mercado"].sort()
    );
  });

  it("ignora termos vazios e não bate quando não há ocorrência", () => {
    const hits = findRestrictedHits("Texto neutro sem nada.", [
      { term: "", action: "block" },
      { term: "promessa", action: "block" },
    ]);
    expect(hits).toEqual([]);
  });

  it("retorna vazio quando texto é falsy ou lista é vazia", () => {
    expect(findRestrictedHits("", [{ term: "x", action: "block" }])).toEqual([]);
    expect(findRestrictedHits("texto", [])).toEqual([]);
  });
});

describe("maskRestrictedTerms", () => {
  it("substitui ocorrências por travessão preservando o resto", () => {
    const out = maskRestrictedTerms(
      "Tenho a certeza absoluta de que é o melhor do mercado.",
      [
        { term: "certeza absoluta" },
        { term: "melhor do mercado" },
      ]
    );
    expect(out).toBe("Tenho a — de que é o —.");
  });

  it("é case-insensitive e escapa metacaracteres regex", () => {
    const out = maskRestrictedTerms("Promo (R$10) GARANTIDA já hoje", [
      { term: "(R$10)" },
      { term: "garantida" },
    ]);
    expect(out).toBe("Promo — — já hoje");
  });

  it("retorna o próprio texto quando não há termos", () => {
    expect(maskRestrictedTerms("nada a substituir", [])).toBe("nada a substituir");
  });
});

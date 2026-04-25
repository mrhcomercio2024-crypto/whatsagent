import { describe, expect, it } from "vitest";
import { splitMessage } from "./splitter";

describe("splitMessage", () => {
  it("retorna lista vazia para texto vazio", () => {
    expect(splitMessage("")).toEqual([]);
    expect(splitMessage("   ")).toEqual([]);
  });

  it("não quebra textos curtos", () => {
    expect(splitMessage("oi tudo bem?", { maxChars: 100 })).toEqual([
      "oi tudo bem?",
    ]);
  });

  it("retorna texto inteiro quando desativado", () => {
    const big = "a".repeat(800);
    expect(splitMessage(big, { enabled: false, maxChars: 100 })).toEqual([big]);
  });

  it("quebra por parágrafos quando há linhas em branco", () => {
    const text = "Olá!\n\nTudo bem?\n\nQueria te oferecer algo.";
    const parts = splitMessage(text, { maxChars: 80 });
    expect(parts).toEqual(["Olá!", "Tudo bem?", "Queria te oferecer algo."]);
  });

  it("agrupa frases curtas até atingir o limite", () => {
    const text = "Oi! Tudo bem? Queria te apresentar nossa solução.";
    const parts = splitMessage(text, { maxChars: 25 });
    // cabe ~"Oi! Tudo bem?" (13) + "Queria te apresentar..." separado
    expect(parts.length).toBeGreaterThanOrEqual(2);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(50);
  });

  it("nunca corta palavra no meio quando dá para evitar", () => {
    const text =
      "Nossa solução é completa, atende grandes equipes e tem suporte 24x7 incluído no plano profissional.";
    const parts = splitMessage(text, { maxChars: 40 });
    for (const p of parts) {
      // garante que nenhum pedaço termina/inicia com hífen ou letra "cortada"
      expect(p).toBe(p.trim());
      expect(p.length).toBeLessThanOrEqual(40);
    }
    // deve dar para reconstruir o texto unindo com espaço
    const recomposed = parts.join(" ").replace(/\s+/g, " ").trim();
    expect(recomposed).toBe(text.replace(/\s+/g, " ").trim());
  });

  it("quebra por palavras quando uma frase única excede o limite", () => {
    const longSentence =
      "essa é uma frase muito muito muito muito muito muito muito muito muito longa sem nenhum ponto final no meio ainda continua assim por mais um bom pedaço";
    const parts = splitMessage(longSentence, { maxChars: 50 });
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(50);
  });

  it("respeita o mínimo de 40 chars no maxChars", () => {
    const text = "qualquer coisa aqui";
    expect(splitMessage(text, { maxChars: 1 })).toEqual([text]);
  });

  it("lida com palavra única gigante (URL etc.) quebrando duro", () => {
    const url = "https://exemplo.com/" + "a".repeat(300);
    const parts = splitMessage(url, { maxChars: 80 });
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(80);
    expect(parts.join("")).toBe(url);
  });
});

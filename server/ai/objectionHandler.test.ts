import { describe, it, expect, beforeEach } from "vitest";
import {
  buildObjectionHint,
  invalidateObjectionsCache,
  normalize,
  _setCacheForTests,
  type ObjectionRow,
  type ObjectionMatch,
} from "./objectionHandler";

const fakeRow = (overrides: Partial<ObjectionRow> = {}): ObjectionRow => ({
  id: 1,
  name: "Preço alto",
  description: null,
  triggerKeywords: ["caro", "muito caro", "fora do orcamento"],
  triggerRegex: [],
  responseTemplate: "Entendo a preocupação. Olha que vale cada centavo:",
  literalResponse: false,
  mediaIds: [],
  nextStepAction: "stay",
  priority: 100,
  isActive: true,
  sendOncePerConversation: true,
  ...overrides,
});

describe("normalize", () => {
  it("remove acentos, deixa minúsculo, colapsa espaços", () => {
    expect(normalize("Está MUITO  Caro!")).toBe("esta muito caro");
    expect(normalize("não pode")).toBe("nao pode");
  });
  it("trata vazio", () => {
    expect(normalize("")).toBe("");
  });
});

describe("buildObjectionHint", () => {
  beforeEach(() => invalidateObjectionsCache());

  it("monta hint não-literal com gatilhos e ação stay", () => {
    const m: ObjectionMatch = {
      match: fakeRow(),
      matchedKeywords: ["caro"],
      matchedRegex: [],
    };
    const hint = buildObjectionHint(m);
    expect(hint).toMatch(/OBJEÇÃO DETECTADA/);
    expect(hint).toMatch(/Preço alto/);
    expect(hint).toMatch(/caro/);
    expect(hint).toMatch(/permaneça na etapa atual/);
  });

  it("monta hint literal sem template livre", () => {
    const m: ObjectionMatch = {
      match: fakeRow({
        literalResponse: true,
        responseTemplate: "Hoje está R$97 com 30% off, link: bit.ly/x",
      }),
      matchedKeywords: ["caro"],
      matchedRegex: [],
    };
    const hint = buildObjectionHint(m);
    expect(hint).toMatch(/MODO LITERAL OBJEÇÃO/);
    expect(hint).toMatch(/Hoje está R\$97/);
  });

  it("usa nextStepAction=advance quando configurado", () => {
    const m: ObjectionMatch = {
      match: fakeRow({ nextStepAction: "advance" }),
      matchedKeywords: ["caro"],
      matchedRegex: [],
    };
    const hint = buildObjectionHint(m);
    expect(hint).toMatch(/avance para a próxima etapa/);
  });
});

describe("_setCacheForTests", () => {
  it("popula cache sem tocar DB", () => {
    invalidateObjectionsCache();
    _setCacheForTests(99, [fakeRow()]);
    // chamada subsequente de detectObjection usaria o cache; aqui só garantimos que não lança.
    expect(true).toBe(true);
  });
});

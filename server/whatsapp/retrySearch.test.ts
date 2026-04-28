import { describe, it, expect } from "vitest";
import { normalizeSearch, escapeLike } from "./retrySearch";

describe("normalizeSearch", () => {
  it("retorna null para entrada nula/indefinida/vazia", () => {
    expect(normalizeSearch(null)).toBeNull();
    expect(normalizeSearch(undefined)).toBeNull();
    expect(normalizeSearch("")).toBeNull();
    expect(normalizeSearch("   ")).toBeNull();
  });

  it("classifica como telefone quando tem 4+ dígitos majoritários", () => {
    expect(normalizeSearch("9606")).toEqual({ kind: "phone", digits: "9606" });
    expect(normalizeSearch("+55 21 99606-9901")).toEqual({
      kind: "phone",
      digits: "5521996069901",
    });
    expect(normalizeSearch("(21) 9 9606-9901")).toEqual({
      kind: "phone",
      digits: "21996069901",
    });
    expect(normalizeSearch("21996069901")).toEqual({
      kind: "phone",
      digits: "21996069901",
    });
  });

  it("classifica como nome quando há texto predominante", () => {
    expect(normalizeSearch("Marcelo")).toEqual({
      kind: "name",
      text: "marcelo",
    });
    expect(normalizeSearch("  João da Silva  ")).toEqual({
      kind: "name",
      text: "joão da silva",
    });
    // 3 dígitos + texto -> ainda é nome (precisa >=4 dígitos para virar phone)
    expect(normalizeSearch("loja 123")).toEqual({
      kind: "name",
      text: "loja 123",
    });
  });

  it("considera nome quando os dígitos são minoria do termo", () => {
    // "abc1234567" tem 7 dígitos / 10 chars = 70% -> phone
    expect(normalizeSearch("abc1234567")).toEqual({
      kind: "phone",
      digits: "1234567",
    });
    // "abcdefg1234" tem 4/11 = 36% -> name
    expect(normalizeSearch("abcdefg1234")).toEqual({
      kind: "name",
      text: "abcdefg1234",
    });
  });
});

describe("escapeLike", () => {
  it("não muda strings sem caracteres especiais", () => {
    expect(escapeLike("Marcelo")).toBe("Marcelo");
    expect(escapeLike("21996069901")).toBe("21996069901");
  });

  it("escapa %, _ e \\", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("a\\b")).toBe("a\\\\b");
    expect(escapeLike("50% _off_")).toBe("50\\% \\_off\\_");
  });
});

import { describe, expect, it } from "vitest";
import {
  extractIdentifiers,
  normalizeEmail,
  normalizePhoneBR,
} from "./identify";

describe("normalizePhoneBR", () => {
  it("aceita celular com 11 dígitos sem DDI e prefixa 55", () => {
    expect(normalizePhoneBR("11999998888")).toBe("5511999998888");
  });

  it("aceita formato com máscara e DDI já presente", () => {
    expect(normalizePhoneBR("+55 (11) 99999-8888")).toBe("5511999998888");
  });

  it("aceita fixo 10 dígitos", () => {
    expect(normalizePhoneBR("1133334444")).toBe("551133334444");
  });

  it("preserva número internacional não-BR", () => {
    expect(normalizePhoneBR("14155551234")).toBe("5514155551234"); // 11 dígitos: trata como BR
    expect(normalizePhoneBR("442071838750")).toBe("442071838750"); // 12 dígitos não-BR
  });

  it("rejeita lixo / muito curto", () => {
    expect(normalizePhoneBR("abc")).toBeNull();
    expect(normalizePhoneBR("12345")).toBeNull();
    expect(normalizePhoneBR(null)).toBeNull();
    expect(normalizePhoneBR(undefined)).toBeNull();
    expect(normalizePhoneBR("")).toBeNull();
  });

  it("remove zeros internacionais", () => {
    expect(normalizePhoneBR("005511999998888")).toBe("5511999998888");
  });
});

describe("normalizeEmail", () => {
  it("normaliza casing e trim", () => {
    expect(normalizeEmail("  Foo@BAR.com ")).toBe("foo@bar.com");
  });
  it("rejeita inválido", () => {
    expect(normalizeEmail("nao-tem-arroba")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe("extractIdentifiers", () => {
  it("usa overrides do nível raiz quando presentes", () => {
    const r = extractIdentifiers({
      phone: "11999998888",
      email: "X@Y.COM",
      name: "Maria",
      payload: { whatever: 1 },
    });
    expect(r.phone).toBe("5511999998888");
    expect(r.email).toBe("x@y.com");
    expect(r.name).toBe("Maria");
    expect(r.primary).toBe("5511999998888");
    expect(r.primaryKind).toBe("phone");
  });

  it("encontra telefone aninhado em buyer", () => {
    const r = extractIdentifiers({
      data: {
        buyer: {
          name: "João",
          buyer_phone: "(11) 98888-7777",
          buyer_email: "joao@example.com",
        },
      },
    });
    expect(r.phone).toBe("5511988887777");
    expect(r.email).toBe("joao@example.com");
    expect(r.name).toBe("João");
    expect(r.primary).toBe("5511988887777");
  });

  it("retorna primaryKind=email quando só tem email", () => {
    const r = extractIdentifiers({
      customer: { customer_email: "abc@def.com", name: "Ana" },
    });
    expect(r.phone).toBeNull();
    expect(r.email).toBe("abc@def.com");
    expect(r.primary).toBe("abc@def.com");
    expect(r.primaryKind).toBe("email");
  });

  it("não quebra com payload null/undefined", () => {
    const r = extractIdentifiers(null);
    expect(r.phone).toBeNull();
    expect(r.email).toBeNull();
    expect(r.primary).toBeNull();
    expect(r.primaryKind).toBeNull();
  });

  it("encontra telefone num campo 'telefone' em PT-BR", () => {
    const r = extractIdentifiers({ pedido: { telefone: "21999991234" } });
    expect(r.phone).toBe("5521999991234");
  });
});

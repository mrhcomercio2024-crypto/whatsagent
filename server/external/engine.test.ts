import { describe, expect, it } from "vitest";
import { renderTemplate } from "./engine";

describe("renderTemplate", () => {
  const ctx = {
    name: "Maria",
    phone: "5511999998888",
    email: "maria@example.com",
    payload: {
      order: { id: "ABC123", value: 199.9 },
      product: { name: "Curso X" },
    },
  };

  it("substitui variáveis simples", () => {
    expect(renderTemplate("Olá {{name}}, tudo bem?", ctx)).toBe(
      "Olá Maria, tudo bem?"
    );
  });

  it("substitui telefone e email", () => {
    expect(renderTemplate("{{phone}} - {{email}}", ctx)).toBe(
      "5511999998888 - maria@example.com"
    );
  });

  it("acessa payload aninhado", () => {
    expect(
      renderTemplate("Pedido {{payload.order.id}} no valor {{payload.order.value}}", ctx)
    ).toBe("Pedido ABC123 no valor 199.9");
  });

  it("retorna vazio para chave inexistente sem quebrar", () => {
    expect(renderTemplate("Foo {{payload.nada.aqui}} bar", ctx)).toBe("Foo  bar");
  });

  it("ignora chaves desconhecidas", () => {
    expect(renderTemplate("X {{naoexiste}} Y", ctx)).toBe("X  Y");
  });

  it("preserva texto sem placeholders", () => {
    expect(renderTemplate("texto puro", ctx)).toBe("texto puro");
  });

  it("aceita espaços extras nas chaves", () => {
    expect(renderTemplate("Olá {{ name }}!", ctx)).toBe("Olá Maria!");
  });

  it("funciona quando payload é null", () => {
    const c = { name: "X", phone: null, email: null, payload: null };
    expect(renderTemplate("Hi {{name}}, ped {{payload.order.id}}!", c)).toBe(
      "Hi X, ped !"
    );
  });
});

import { describe, it, expect } from "vitest";
import { resolveLeadNameForPrompt, leadDisclosedName } from "./leadNameGuard";

const mkInbound = (body: string) =>
  ({
    direction: "inbound",
    sender: "lead",
    body,
    contentType: "text",
    createdAt: new Date(),
  }) as any;

const mkOutbound = (body: string) =>
  ({
    direction: "outbound",
    sender: "ai",
    body,
    contentType: "text",
    createdAt: new Date(),
  }) as any;

describe("leadNameGuard", () => {
  it("retorna null se nome do DB for vazio", () => {
    expect(resolveLeadNameForPrompt({ history: [], dbName: null })).toBeNull();
    expect(resolveLeadNameForPrompt({ history: [], dbName: "" })).toBeNull();
  });

  it("retorna null quando o lead nunca disse o nome (só perfil do WhatsApp)", () => {
    const history = [mkInbound("oi"), mkOutbound("Olá! Como posso ajudar?"), mkInbound("quanto custa?")];
    expect(resolveLeadNameForPrompt({ history, dbName: "Joaquim" })).toBeNull();
  });

  it("libera o nome quando o lead se apresenta com 'meu nome é X'", () => {
    const history = [
      mkOutbound("Posso saber seu nome?"),
      mkInbound("Meu nome é João Silva"),
    ];
    expect(resolveLeadNameForPrompt({ history, dbName: "João Silva" })).toBe("João Silva");
  });

  it("libera o nome quando o lead diz 'me chamo X'", () => {
    const history = [mkInbound("Oi, me chamo Pedro")];
    expect(leadDisclosedName(history, "Pedro")).toBe(true);
  });

  it("libera quando o nome do DB aparece como token isolado em fala do lead", () => {
    const history = [mkInbound("aqui é maria, tudo bem?")];
    expect(resolveLeadNameForPrompt({ history, dbName: "Maria" })).toBe("Maria");
  });

  it("não confunde mensagem outbound do agente como auto-apresentação", () => {
    const history = [mkOutbound("Meu nome é Carlos, sou consultor."), mkInbound("ok")];
    expect(resolveLeadNameForPrompt({ history, dbName: "Carlos" })).toBeNull();
  });
});

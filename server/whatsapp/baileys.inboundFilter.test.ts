import { describe, it, expect } from "vitest";
import { shouldProcessInbound } from "./baileys";

describe("shouldProcessInbound (blindagens contra auto-resposta e ruído)", () => {
  const self = "5511999998888:12@s.whatsapp.net";

  it("aceita mensagem normal de um lead externo", () => {
    const r = shouldProcessInbound({
      fromMe: false,
      remoteJid: "5511988887777@s.whatsapp.net",
      selfJid: self,
      hasMessage: true,
    });
    expect(r.accept).toBe(true);
    expect(r.phone).toBe("5511988887777");
  });

  it("rejeita quando fromMe=true (eco do próprio aparelho)", () => {
    const r = shouldProcessInbound({
      fromMe: true,
      remoteJid: "5511988887777@s.whatsapp.net",
      selfJid: self,
      hasMessage: true,
    });
    expect(r.accept).toBe(false);
    expect(r.reason).toBe("from_me");
  });

  it("rejeita quando remoteJid é o próprio número (self-message)", () => {
    const r = shouldProcessInbound({
      fromMe: false,
      remoteJid: "5511999998888@s.whatsapp.net",
      selfJid: self,
      hasMessage: true,
    });
    expect(r.accept).toBe(false);
    expect(r.reason).toBe("self_message");
  });

  it("rejeita quando remoteJid é o próprio número com sufixo :device", () => {
    const r = shouldProcessInbound({
      fromMe: false,
      remoteJid: "5511999998888:8@s.whatsapp.net",
      selfJid: self,
      hasMessage: true,
    });
    expect(r.accept).toBe(false);
    expect(r.reason).toBe("self_message");
  });

  it("rejeita grupos (@g.us)", () => {
    const r = shouldProcessInbound({
      fromMe: false,
      remoteJid: "123456789012345678@g.us",
      selfJid: self,
      hasMessage: true,
    });
    expect(r.accept).toBe(false);
    expect(r.reason).toBe("group");
  });

  it("rejeita broadcasts e status", () => {
    expect(
      shouldProcessInbound({
        fromMe: false,
        remoteJid: "status@broadcast",
        selfJid: self,
        hasMessage: true,
      }).reason
    ).toBe("status");
    expect(
      shouldProcessInbound({
        fromMe: false,
        remoteJid: "12345678@broadcast",
        selfJid: self,
        hasMessage: true,
      }).reason
    ).toBe("broadcast");
  });

  it("rejeita newsletters/canais (@newsletter)", () => {
    const r = shouldProcessInbound({
      fromMe: false,
      remoteJid: "120363123456789@newsletter",
      selfJid: self,
      hasMessage: true,
    });
    expect(r.accept).toBe(false);
    expect(r.reason).toBe("newsletter");
  });

  it("rejeita quando não há mensagem", () => {
    const r = shouldProcessInbound({
      fromMe: false,
      remoteJid: "5511988887777@s.whatsapp.net",
      selfJid: self,
      hasMessage: false,
    });
    expect(r.accept).toBe(false);
    expect(r.reason).toBe("no_message");
  });

  it("rejeita quando remoteJid é vazio", () => {
    const r = shouldProcessInbound({
      fromMe: false,
      remoteJid: "",
      selfJid: self,
      hasMessage: true,
    });
    expect(r.accept).toBe(false);
    expect(r.reason).toBe("empty_remote_jid");
  });

  it("aceita mesmo sem selfJid conhecido (ainda em conexão)", () => {
    const r = shouldProcessInbound({
      fromMe: false,
      remoteJid: "5511988887777@s.whatsapp.net",
      selfJid: null,
      hasMessage: true,
    });
    expect(r.accept).toBe(true);
    expect(r.phone).toBe("5511988887777");
  });

  it("compara apenas o número, ignorando formato diferente (self com + e com :device)", () => {
    const r = shouldProcessInbound({
      fromMe: false,
      remoteJid: "+5511999998888@s.whatsapp.net",
      selfJid: "5511999998888:7@s.whatsapp.net",
      hasMessage: true,
    });
    expect(r.accept).toBe(false);
    expect(r.reason).toBe("self_message");
  });
});

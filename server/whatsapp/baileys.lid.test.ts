import { describe, it, expect } from "vitest";
import { resolveRealPhone } from "./baileys";

describe("resolveRealPhone (LID handling)", () => {
  it("usa remoteJid normal quando não é @lid", () => {
    const r = resolveRealPhone({ remoteJid: "5521987654321@s.whatsapp.net" });
    expect(r.phone).toBe("5521987654321");
    expect(r.jidForSend).toBe("5521987654321@s.whatsapp.net");
    expect(r.isLid).toBe(false);
  });

  it("prefere senderPn sobre @lid quando ambos existem", () => {
    const r = resolveRealPhone({
      remoteJid: "233268599332983@lid",
      senderPn: "5521987654321@s.whatsapp.net",
    });
    expect(r.phone).toBe("5521987654321");
    expect(r.jidForSend).toBe("5521987654321@s.whatsapp.net");
    expect(r.isLid).toBe(false);
  });

  it("cai para @lid quando não há senderPn nem outras fontes não-LID", () => {
    const r = resolveRealPhone({ remoteJid: "233268599332983@lid" });
    expect(r.phone).toBe("233268599332983");
    expect(r.jidForSend).toBe("233268599332983@lid");
    expect(r.isLid).toBe(true);
  });

  it("usa participantPn em grupos quando disponível", () => {
    const r = resolveRealPhone({
      remoteJid: "12345@g.us",
      participantPn: "5521987654321@s.whatsapp.net",
    });
    expect(r.phone).toBe("5521987654321");
    expect(r.jidForSend).toBe("5521987654321@s.whatsapp.net");
    expect(r.isLid).toBe(false);
  });

  it("aceita senderPn em formato puro (só dígitos)", () => {
    const r = resolveRealPhone({
      remoteJid: "111@lid",
      senderPn: "5521987654321",
    });
    expect(r.phone).toBe("5521987654321");
    expect(r.isLid).toBe(false);
  });

  it("retorna null quando remoteJid está vazio e não há fallback", () => {
    const r = resolveRealPhone({ remoteJid: "" });
    expect(r.phone).toBeNull();
    expect(r.jidForSend).toBeNull();
  });

  it("ignora device suffix (:NN) ao extrair dígitos", () => {
    const r = resolveRealPhone({ remoteJid: "5521987654321:1@s.whatsapp.net" });
    expect(r.phone).toBe("5521987654321");
  });

  it("ignora @lid em senderPn (não pode ser real)", () => {
    const r = resolveRealPhone({
      remoteJid: "233268599332983@lid",
      senderPn: "987654321@lid",
    });
    expect(r.isLid).toBe(true);
    expect(r.phone).toBe("233268599332983");
  });
});

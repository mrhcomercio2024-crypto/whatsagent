import { describe, it, expect } from "vitest";
import { renderToneBlock, looksRobotic } from "./tonePresets";

describe("renderToneBlock", () => {
  it("aplica preset natural com gírias", () => {
    const out = renderToneBlock({
      toneProfile: "natural",
      emojiPolicy: "sparse",
      useLeadNamePct: 30,
      agentName: "Jac",
    });
    expect(out).toMatch(/CONVERSACIONAL BRASILEIRO/);
    expect(out).toMatch(/cê|tipo|rapidinho/);
    expect(out).toMatch(/NUNCA escreva como assistente virtual/);
    expect(out).toMatch(/Jac/);
  });

  it("aplica preset balanced sem gírias pesadas", () => {
    const out = renderToneBlock({
      toneProfile: "balanced",
      emojiPolicy: "sparse",
      useLeadNamePct: 30,
    });
    expect(out).toMatch(/PROFISSIONAL E AMIG[\u00c0-\u00ff]VEL|PROFISSIONAL E AMIG/);
    expect(out).not.toMatch(/CONVERSACIONAL BRASILEIRO/);
  });

  it("aplica preset rigid sem contrações", () => {
    const out = renderToneBlock({
      toneProfile: "rigid",
      emojiPolicy: "none",
      useLeadNamePct: 0,
    });
    expect(out).toMatch(/FORMAL E CORPORATIVO/);
    expect(out).toMatch(/proibido/);
    expect(out).toMatch(/n[\u00c3\u00e3]o use o nome|n[\u00c3\u00e3]o usar/);
  });

  it("custom usa o tom escrito pelo usuário", () => {
    const out = renderToneBlock({
      toneProfile: "custom",
      emojiPolicy: "rich",
      useLeadNamePct: 50,
      customTone: "Fale como o Mestre Yoda. Inverter as frases você deve.",
    });
    expect(out).toMatch(/Mestre Yoda/);
    expect(out).toMatch(/EMOJIS \u2014 uso livre/);
  });

  it("emoji policy 'none' bloqueia emojis", () => {
    const out = renderToneBlock({
      toneProfile: "balanced",
      emojiPolicy: "none",
      useLeadNamePct: 30,
    });
    expect(out).toMatch(/EMOJIS \u2014 proibido/);
  });
});

describe("looksRobotic", () => {
  it("detecta formalismo corporativo", () => {
    expect(looksRobotic("Prezado cliente, conforme mencionado anteriormente...").robotic).toBe(true);
    expect(looksRobotic("Atenciosamente, fico ao seu dispor.").robotic).toBe(true);
  });

  it("detecta auto-referência como IA", () => {
    expect(looksRobotic("Sou um assistente virtual treinado para...").robotic).toBe(true);
    expect(looksRobotic("Como uma IA, fui programada para te ajudar.").robotic).toBe(true);
  });

  it("detecta closer chato", () => {
    expect(looksRobotic("Posso ajudar em algo mais?").robotic).toBe(true);
  });

  it("aceita texto natural", () => {
    expect(looksRobotic("Olha só, top demais o que cê me contou! Bora pro próximo passo?").robotic).toBe(false);
    expect(looksRobotic("Saquei. E quanto cê tá pensando em investir?").robotic).toBe(false);
  });
});

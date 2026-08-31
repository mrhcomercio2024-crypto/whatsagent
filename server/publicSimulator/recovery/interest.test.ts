import { describe, expect, it } from "vitest";
import { isPushOptOutMessage, isStrongInterest, scoreObjectiveInterest } from "./interest";

describe("objective recovery interest", () => {
  it("requires at least four lead interactions even with a high score", () => {
    const result = scoreObjectiveInterest({
      inboundTexts: ["Qual o preço?", "Quero o link", "Tem algum case real?"],
      interactionCount: 3,
      temperature: "hot",
      advancedStage: true,
      scoreThreshold: 40,
    });
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.eligible).toBe(false);
  });

  it("scores price, operation, marketplaces, proof and CTA objectively", () => {
    const result = scoreObjectiveInterest({
      inboundTexts: [
        "Como funciona?",
        "Vende em marketplace como Mercado Livre?",
        "Qual o preço?",
        "Tem case real? Quero o link.",
      ],
      interactionCount: 4,
      temperature: "warm",
      advancedStage: false,
      scoreThreshold: 40,
    });
    expect(result.eligible).toBe(true);
    expect(result.signals.map(signal => signal.code)).toEqual(
      expect.arrayContaining(["interactions_4_plus", "asked_price", "asked_how_it_works", "asked_marketplace", "asked_proof", "cta_intent"]),
    );
  });

  it("treats explicit alert request as a strong signal", () => {
    const result = scoreObjectiveInterest({
      inboundTexts: ["Como funciona?", "Legal", "Me explica", "Pode me avisar depois"],
      interactionCount: 4,
      temperature: "warm",
      advancedStage: false,
      scoreThreshold: 40,
    });
    expect(result.signals.some(signal => signal.code === "requested_alerts")).toBe(true);
    expect(isStrongInterest({ score: result.score, strongThreshold: 65, signals: result.signals, explicitlyRequestedAlerts: true })).toBe(true);
  });

  it("detects opt-out language", () => {
    expect(isPushOptOutMessage("Por favor, não quero receber notificações")).toBe(true);
    expect(isPushOptOutMessage("Pode me explicar como funciona?")).toBe(false);
  });
});

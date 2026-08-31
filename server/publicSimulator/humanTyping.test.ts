import { describe, expect, it } from "vitest";
import {
  calculateHumanInterMessageDelay,
  calculateHumanPreparationDelay,
  calculateHumanTypingDelay,
} from "../../shared/humanTyping";

const timing = {
  typingSimulationEnabled: true,
  typingCps: 20,
  typingMinDelayMs: 700,
  typingMaxDelayMs: 8000,
  interMessageDelayMs: 1200,
};

describe("human typing rhythm", () => {
  it("takes longer for longer messages", () => {
    const short = calculateHumanTypingDelay("Oi!", timing, 0.5);
    const long = calculateHumanTypingDelay(
      "Vou te explicar como o modelo funciona e depois te faço uma pergunta rapidinho.",
      timing,
      0.5,
    );
    expect(long).toBeGreaterThan(short);
  });

  it("respects configured minimum and maximum", () => {
    expect(calculateHumanTypingDelay("Oi", timing, 0)).toBe(700);
    expect(calculateHumanTypingDelay("x".repeat(1000), timing, 1)).toBe(8000);
  });

  it("adds natural punctuation pauses", () => {
    const plain = calculateHumanTypingDelay("vamos conversar agora", timing, 0.5);
    const punctuated = calculateHumanTypingDelay("vamos, conversar, agora!", timing, 0.5);
    expect(punctuated).toBeGreaterThan(plain);
  });

  it("returns a quick fallback when simulation is disabled", () => {
    expect(
      calculateHumanTypingDelay("uma mensagem longa", { ...timing, typingSimulationEnabled: false }),
    ).toBe(250);
  });

  it("prepares each bubble before typing", () => {
    expect(calculateHumanPreparationDelay(0, 0)).toBe(420);
    expect(calculateHumanPreparationDelay(0, 1)).toBe(900);
    expect(calculateHumanPreparationDelay(1, 0)).toBe(650);
    expect(calculateHumanPreparationDelay(1, 1)).toBe(1350);
  });

  it("keeps inter-message pauses within human limits", () => {
    expect(calculateHumanInterMessageDelay(1200, 0)).toBeGreaterThanOrEqual(650);
    expect(calculateHumanInterMessageDelay(1200, 1)).toBeLessThanOrEqual(3200);
  });

  it("renders the public simulator without a conversation sidebar", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(
      new URL("../../client/src/pages/PublicSimulatorChat.tsx", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("<aside");
    expect(source).toContain("max-w-[620px]");
    expect(source).toContain("for (let index = 0; index < result.actions.length; index += 1)");
    expect(source).toContain("setPhase(\"idle\")");
    expect(source).toContain("calculateHumanInterMessageDelay");
  });

  it("keeps debounce private without showing a seconds countdown to the visitor", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(
      new URL("../../client/src/pages/PublicSimulatorChat.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('setPhase("waiting")');
    expect(source).toContain("timing.debounceSeconds");
    expect(source).not.toContain("setCountdown");
    expect(source).not.toContain("responde em ${countdown}s");
    expect(source).not.toContain("começa a responder em");
  });
});

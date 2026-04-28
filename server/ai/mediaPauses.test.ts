import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  pauseBeforeMedia,
  pauseAfterMedia,
  pauseBetweenMessages,
  jitter,
} from "./humanize";

describe("jitter()", () => {
  it("retorna min quando max <= min", () => {
    expect(jitter(500, 500)).toBe(500);
    expect(jitter(500, 400)).toBe(500);
  });

  it("retorna valor dentro de [min, max) para range positivo", () => {
    for (let i = 0; i < 50; i++) {
      const v = jitter(1000, 3000);
      expect(v).toBeGreaterThanOrEqual(1000);
      expect(v).toBeLessThan(3000);
    }
  });

  it("respeita piso zero quando min negativo", () => {
    expect(jitter(-100, -50)).toBe(0);
  });
});

describe("pauseBeforeMedia()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("não pausa se interMessageDelayMs <= 0", async () => {
    const p = pauseBeforeMedia({ interMessageDelayMs: 0 });
    await expect(p).resolves.toBeUndefined();
  });

  it("usa multiplicador 1.5x–3x do base", async () => {
    // Math.random -> 0  → jitter retorna min (1.5x base)
    vi.spyOn(Math, "random").mockReturnValue(0);
    const promise = pauseBeforeMedia({ interMessageDelayMs: 1000 });
    // Deve dormir 1500ms (1.5 * 1000)
    await vi.advanceTimersByTimeAsync(1500);
    await promise;
  });

  it("no extremo superior, dorme até 3x-1 (jitter é floor)", async () => {
    // Math.random -> 0.999... → jitter próximo de max (3x base - 1)
    vi.spyOn(Math, "random").mockReturnValue(0.9999);
    const promise = pauseBeforeMedia({ interMessageDelayMs: 1000 });
    await vi.advanceTimersByTimeAsync(3000);
    await promise;
  });
});

describe("pauseAfterMedia()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("não pausa se interMessageDelayMs <= 0", async () => {
    const p = pauseAfterMedia({ interMessageDelayMs: 0 });
    await expect(p).resolves.toBeUndefined();
  });

  it("usa multiplicador 1x–2x do base", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const promise = pauseAfterMedia({ interMessageDelayMs: 2000 });
    // 1x base = 2000ms
    await vi.advanceTimersByTimeAsync(2000);
    await promise;
  });
});

describe("pauseBetweenMessages() — sanity (não quebrada pela refatoração)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("usa exatamente interMessageDelayMs (sem jitter)", async () => {
    const p = pauseBetweenMessages({ interMessageDelayMs: 1500 });
    await vi.advanceTimersByTimeAsync(1500);
    await p;
  });

  it("pula quando delay é zero", async () => {
    const p = pauseBetweenMessages({ interMessageDelayMs: 0 });
    await expect(p).resolves.toBeUndefined();
  });
});

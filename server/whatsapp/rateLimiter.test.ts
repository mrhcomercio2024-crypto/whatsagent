import { describe, it, expect, beforeEach } from "vitest";
import {
  acquireToken,
  usedInWindow,
  _resetRateLimiterForTest,
} from "./rateLimiter";

// Helpers: tempo e sleep controláveis para determinismo.
function makeClock() {
  let t = 0;
  const now = () => t;
  const sleep = async (ms: number) => {
    t += ms;
  };
  const tick = (ms: number) => {
    t += ms;
  };
  return { now, sleep, tick };
}

describe("rateLimiter: token bucket por agente", () => {
  beforeEach(() => _resetRateLimiterForTest());

  it("passa direto quando há tokens disponíveis", async () => {
    const clock = makeClock();
    for (let i = 0; i < 5; i++) {
      const r = await acquireToken(1, {
        maxPerWindow: 5,
        windowMs: 1000,
        now: clock.now,
        sleep: clock.sleep,
      });
      expect(r.waitedMs).toBe(0);
    }
    expect(usedInWindow(1, { windowMs: 1000, now: clock.now })).toBe(5);
  });

  it("atrasa quando bucket está cheio", async () => {
    const clock = makeClock();
    // Enche o bucket (5 envios no tempo 0)
    for (let i = 0; i < 5; i++) {
      await acquireToken(1, {
        maxPerWindow: 5,
        windowMs: 1000,
        now: clock.now,
        sleep: clock.sleep,
      });
    }
    // 6º envio: deve esperar ~1000ms (até o mais antigo sair da janela)
    const r = await acquireToken(1, {
      maxPerWindow: 5,
      windowMs: 1000,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(r.waitedMs).toBeGreaterThanOrEqual(1000);
    expect(r.waitedMs).toBeLessThan(1100);
  });

  it("liberta tokens conforme a janela desliza", async () => {
    const clock = makeClock();
    for (let i = 0; i < 3; i++) {
      await acquireToken(1, {
        maxPerWindow: 3,
        windowMs: 500,
        now: clock.now,
        sleep: clock.sleep,
      });
    }
    expect(usedInWindow(1, { windowMs: 500, now: clock.now })).toBe(3);
    clock.tick(600); // passa da janela
    expect(usedInWindow(1, { windowMs: 500, now: clock.now })).toBe(0);
    const r = await acquireToken(1, {
      maxPerWindow: 3,
      windowMs: 500,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(r.waitedMs).toBe(0);
  });

  it("bucket por agente é isolado (agente A não afeta agente B)", async () => {
    const clock = makeClock();
    for (let i = 0; i < 10; i++) {
      await acquireToken(1, {
        maxPerWindow: 10,
        windowMs: 1000,
        now: clock.now,
        sleep: clock.sleep,
      });
    }
    // Agente 2 começa com bucket vazio
    const r = await acquireToken(2, {
      maxPerWindow: 10,
      windowMs: 1000,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(r.waitedMs).toBe(0);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computeBackoffMs,
  scheduleReconnect,
  cancelReconnect,
  hasPendingReconnect,
  _clearAllPendingForTest,
} from "./reconnect";

describe("computeBackoffMs (backoff exponencial com cap e jitter)", () => {
  it("retorna baseMs na primeira tentativa (sem jitter)", () => {
    const v = computeBackoffMs(1, { baseMs: 1500, jitterMs: 0 });
    expect(v).toBe(1500);
  });

  it("dobra a cada tentativa (factor=2, sem jitter)", () => {
    expect(computeBackoffMs(1, { baseMs: 1000, factor: 2, jitterMs: 0 })).toBe(1000);
    expect(computeBackoffMs(2, { baseMs: 1000, factor: 2, jitterMs: 0 })).toBe(2000);
    expect(computeBackoffMs(3, { baseMs: 1000, factor: 2, jitterMs: 0 })).toBe(4000);
    expect(computeBackoffMs(4, { baseMs: 1000, factor: 2, jitterMs: 0 })).toBe(8000);
  });

  it("respeita o cap mesmo em tentativas altas", () => {
    const v = computeBackoffMs(20, { baseMs: 1500, factor: 2, capMs: 60_000, jitterMs: 0 });
    expect(v).toBeLessThanOrEqual(60_000);
    expect(v).toBe(60_000);
  });

  it("aplica jitter dentro do range esperado", () => {
    // rand=0 -> -jitter, rand=1 -> +jitter, rand=0.5 -> 0
    const minus = computeBackoffMs(1, { baseMs: 1000, jitterMs: 200 }, () => 0);
    const center = computeBackoffMs(1, { baseMs: 1000, jitterMs: 200 }, () => 0.5);
    const plus = computeBackoffMs(1, { baseMs: 1000, jitterMs: 200 }, () => 1);
    expect(minus).toBe(800);
    expect(center).toBe(1000);
    expect(plus).toBe(1200);
  });

  it("nunca retorna negativo", () => {
    const v = computeBackoffMs(1, { baseMs: 100, jitterMs: 1000 }, () => 0);
    expect(v).toBeGreaterThanOrEqual(0);
  });

  it("aceita attempt<1 e trata como 1", () => {
    expect(computeBackoffMs(0, { baseMs: 1000, jitterMs: 0 })).toBe(1000);
    expect(computeBackoffMs(-5, { baseMs: 1000, jitterMs: 0 })).toBe(1000);
  });
});

describe("scheduleReconnect (cancela tentativa anterior)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _clearAllPendingForTest();
  });
  afterEach(() => {
    vi.useRealTimers();
    _clearAllPendingForTest();
  });

  it("dispara o attempt após o delay", async () => {
    const fn = vi.fn(async () => {});
    scheduleReconnect(42, 1000, fn);
    expect(hasPendingReconnect(42)).toBe(true);
    await vi.advanceTimersByTimeAsync(999);
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(hasPendingReconnect(42)).toBe(false);
  });

  it("agendar de novo cancela o anterior — não dispara duas vezes", async () => {
    const fn = vi.fn(async () => {});
    scheduleReconnect(7, 5000, fn);
    scheduleReconnect(7, 1000, fn); // sobrescreve
    await vi.advanceTimersByTimeAsync(1500);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("cancelReconnect impede o disparo", async () => {
    const fn = vi.fn(async () => {});
    scheduleReconnect(99, 1000, fn);
    cancelReconnect(99);
    expect(hasPendingReconnect(99)).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fn).not.toHaveBeenCalled();
  });

  it("agendamentos paralelos para agentes distintos não se afetam", async () => {
    const a = vi.fn(async () => {});
    const b = vi.fn(async () => {});
    scheduleReconnect(1, 500, a);
    scheduleReconnect(2, 1500, b);
    await vi.advanceTimersByTimeAsync(600);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(b).toHaveBeenCalledTimes(1);
  });
});

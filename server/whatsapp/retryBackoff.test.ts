import { describe, it, expect } from "vitest";
import {
  nextRetryAt,
  hasMoreAttempts,
  sanitizeError,
  DEFAULT_BACKOFF_SECONDS,
} from "./retryBackoff";

describe("retryBackoff.nextRetryAt", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("primeira falha (attempt=1) agenda 30s depois", () => {
    const r = nextRetryAt(1, now);
    expect(r.getTime() - now.getTime()).toBe(30_000);
  });

  it("segunda falha (attempt=2) agenda 120s (2min) depois", () => {
    expect(nextRetryAt(2, now).getTime() - now.getTime()).toBe(120_000);
  });

  it("terceira falha (attempt=3) agenda 300s (5min) depois", () => {
    expect(nextRetryAt(3, now).getTime() - now.getTime()).toBe(300_000);
  });

  it("quarta falha (attempt=4) agenda 900s (15min) depois", () => {
    expect(nextRetryAt(4, now).getTime() - now.getTime()).toBe(900_000);
  });

  it("quinta falha (attempt=5) agenda 1800s (30min) depois", () => {
    expect(nextRetryAt(5, now).getTime() - now.getTime()).toBe(1_800_000);
  });

  it("attempt além do schedule usa o último valor (clamp)", () => {
    expect(nextRetryAt(99, now).getTime() - now.getTime()).toBe(1_800_000);
  });

  it("attempt 0 ou negativo usa o primeiro slot", () => {
    expect(nextRetryAt(0, now).getTime() - now.getTime()).toBe(30_000);
    expect(nextRetryAt(-5, now).getTime() - now.getTime()).toBe(30_000);
  });

  it("aceita schedule customizado", () => {
    const custom = [10, 20, 40] as const;
    expect(nextRetryAt(1, now, custom).getTime() - now.getTime()).toBe(10_000);
    expect(nextRetryAt(3, now, custom).getTime() - now.getTime()).toBe(40_000);
    expect(nextRetryAt(99, now, custom).getTime() - now.getTime()).toBe(40_000);
  });

  it("DEFAULT_BACKOFF_SECONDS é estritamente crescente", () => {
    for (let i = 1; i < DEFAULT_BACKOFF_SECONDS.length; i++) {
      expect(DEFAULT_BACKOFF_SECONDS[i]).toBeGreaterThan(
        DEFAULT_BACKOFF_SECONDS[i - 1]
      );
    }
  });
});

describe("retryBackoff.hasMoreAttempts", () => {
  it("retorna true quando attempt < maxAttempts", () => {
    expect(hasMoreAttempts(1, 5)).toBe(true);
    expect(hasMoreAttempts(4, 5)).toBe(true);
  });

  it("retorna false quando attempt >= maxAttempts", () => {
    expect(hasMoreAttempts(5, 5)).toBe(false);
    expect(hasMoreAttempts(6, 5)).toBe(false);
  });
});

describe("retryBackoff.sanitizeError", () => {
  it("extrai mensagem de Error", () => {
    expect(sanitizeError(new Error("boom"))).toBe("boom");
  });

  it("converte string para string", () => {
    expect(sanitizeError("plain error")).toBe("plain error");
  });

  it("converte objetos arbitrários via String()", () => {
    expect(sanitizeError({ code: 42 })).toBe("[object Object]");
    expect(sanitizeError(null)).toBe("null");
    expect(sanitizeError(undefined)).toBe("undefined");
  });

  it("trunca em 500 caracteres", () => {
    const long = "x".repeat(1000);
    const out = sanitizeError(new Error(long));
    expect(out.length).toBe(500);
    expect(out).toBe("x".repeat(500));
  });
});

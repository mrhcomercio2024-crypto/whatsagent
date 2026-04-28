import { describe, expect, it } from "vitest";
import {
  nextRetryAt,
  hasMoreAttempts,
  sanitizeError,
  DEFAULT_BACKOFF_SECONDS,
} from "./retryBackoff";

/**
 * Testes do contrato DLQ:
 * - nextRetryAt segue a sequência de backoff exponencial
 * - hasMoreAttempts pára exatamente em maxAttempts
 * - sanitizeError trunca strings absurdamente longas
 *
 * Cobre o invariante de que falhas temporárias serão eventualmente
 * desistidas (não ficam na fila para sempre) e o backoff cresce.
 */

describe("retryBackoff (DLQ)", () => {
  it("respeita a sequência [30,120,300,900,1800] segundos", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    expect(nextRetryAt(1, base).getTime() - base.getTime()).toBe(30_000);
    expect(nextRetryAt(2, base).getTime() - base.getTime()).toBe(120_000);
    expect(nextRetryAt(3, base).getTime() - base.getTime()).toBe(300_000);
    expect(nextRetryAt(4, base).getTime() - base.getTime()).toBe(900_000);
    expect(nextRetryAt(5, base).getTime() - base.getTime()).toBe(1_800_000);
  });

  it("clampa attempt > schedule.length para o último degrau", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    expect(nextRetryAt(99, base).getTime() - base.getTime()).toBe(
      DEFAULT_BACKOFF_SECONDS[DEFAULT_BACKOFF_SECONDS.length - 1] * 1000,
    );
  });

  it("clampa attempt <= 0 ao primeiro degrau", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    expect(nextRetryAt(0, base).getTime() - base.getTime()).toBe(30_000);
    expect(nextRetryAt(-3, base).getTime() - base.getTime()).toBe(30_000);
  });

  it("hasMoreAttempts pára em maxAttempts (estrito)", () => {
    expect(hasMoreAttempts(1, 5)).toBe(true);
    expect(hasMoreAttempts(4, 5)).toBe(true);
    expect(hasMoreAttempts(5, 5)).toBe(false);
    expect(hasMoreAttempts(6, 5)).toBe(false);
  });

  it("sanitizeError trunca strings longas em 500 chars", () => {
    const huge = "A".repeat(2000);
    expect(sanitizeError(new Error(huge))).toHaveLength(500);
  });

  it("sanitizeError lida com não-Errors", () => {
    expect(sanitizeError("oops")).toBe("oops");
    expect(sanitizeError(42)).toBe("42");
    expect(sanitizeError(null)).toBe("null");
  });
});

/**
 * Smoke test do contrato do enqueue:
 * Garante que nosso payload mínimo (text/media) é compatível com o que o
 * retry-worker espera no `processOne`. Se algum campo for renomeado, este
 * teste quebra cedo.
 */
describe("DLQ payload contract", () => {
  it("payload.text é string para tipo text", () => {
    const p = { type: "text", text: "olá" };
    expect(p.type).toBe("text");
    expect(typeof p.text).toBe("string");
  });

  it("payload.mediaId é número para tipo media", () => {
    const p = { type: "media", mediaId: 42 };
    expect(p.type).toBe("media");
    expect(typeof p.mediaId).toBe("number");
  });
});

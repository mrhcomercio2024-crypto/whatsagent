import { describe, it, expect, beforeEach } from "vitest";
import {
  buildOutboundKey,
  wasRecentlySent,
  markSent,
  pruneOlderThan,
  _resetForTests,
} from "./idempotency";

describe("idempotency", () => {
  beforeEach(() => _resetForTests());

  describe("buildOutboundKey", () => {
    it("normalizes whitespace and case for text", () => {
      const a = buildOutboundKey({ type: "text", text: "Boa tarde, Marcelo!" });
      const b = buildOutboundKey({ type: "text", text: "  boa tarde,   MARCELO!  " });
      expect(a).toBe(b);
    });

    it("differentiates different texts", () => {
      const a = buildOutboundKey({ type: "text", text: "oi" });
      const b = buildOutboundKey({ type: "text", text: "tchau" });
      expect(a).not.toBe(b);
    });

    it("text and media never collide even with similar payload", () => {
      const a = buildOutboundKey({ type: "text", text: "foto" });
      const b = buildOutboundKey({ type: "media", mediaId: 1, caption: "foto" });
      expect(a).not.toBe(b);
    });

    it("media key includes mediaId", () => {
      const a = buildOutboundKey({ type: "media", mediaId: 1 });
      const b = buildOutboundKey({ type: "media", mediaId: 2 });
      expect(a).not.toBe(b);
    });
  });

  describe("wasRecentlySent / markSent", () => {
    it("returns false when nothing is marked", () => {
      const key = buildOutboundKey({ type: "text", text: "oi" });
      expect(wasRecentlySent(42, key)).toBe(false);
    });

    it("returns true after marking and false for different key", () => {
      const k1 = buildOutboundKey({ type: "text", text: "oi" });
      const k2 = buildOutboundKey({ type: "text", text: "tchau" });
      markSent(42, k1);
      expect(wasRecentlySent(42, k1)).toBe(true);
      expect(wasRecentlySent(42, k2)).toBe(false);
    });

    it("isolates per conversation", () => {
      const k = buildOutboundKey({ type: "text", text: "oi" });
      markSent(1, k);
      expect(wasRecentlySent(2, k)).toBe(false);
    });

    it("expires after window", () => {
      const k = buildOutboundKey({ type: "text", text: "oi" });
      const now = 1_000_000;
      markSent(7, k, now);
      expect(wasRecentlySent(7, k, 90_000, now + 30_000)).toBe(true);
      expect(wasRecentlySent(7, k, 90_000, now + 90_001)).toBe(false);
    });
  });

  describe("pruneOlderThan", () => {
    it("removes stale entries and keeps fresh ones", () => {
      const k1 = buildOutboundKey({ type: "text", text: "old" });
      const k2 = buildOutboundKey({ type: "text", text: "new" });
      const t0 = 1_000_000;
      markSent(99, k1, t0);
      markSent(99, k2, t0 + 60_000);
      pruneOlderThan(30_000, t0 + 70_000);
      expect(wasRecentlySent(99, k1, 90_000, t0 + 70_000)).toBe(false);
      expect(wasRecentlySent(99, k2, 90_000, t0 + 70_000)).toBe(true);
    });
  });
});

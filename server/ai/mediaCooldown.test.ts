import { describe, it, expect } from "vitest";
import {
  filterMediaForTurn,
  isMediaOnCooldown,
  lastOutboundMediaTimestamp,
} from "./mediaCooldown";

const mkOutboundMedia = (ts: number) =>
  ({
    direction: "outbound",
    sender: "ai",
    contentType: "video",
    body: null,
    createdAt: new Date(ts),
  }) as any;

const mkOutboundText = (ts: number) =>
  ({
    direction: "outbound",
    sender: "ai",
    contentType: "text",
    body: "alguma coisa",
    createdAt: new Date(ts),
  }) as any;

describe("mediaCooldown", () => {
  it("retorna timestamp da última mídia outbound", () => {
    const now = Date.now();
    const history = [mkOutboundMedia(now - 60_000), mkOutboundText(now - 1000)];
    expect(lastOutboundMediaTimestamp(history)).toBe(now - 60_000);
  });

  it("isMediaOnCooldown=true se a última mídia foi há menos de 60s", () => {
    const now = Date.now();
    const history = [mkOutboundMedia(now - 30_000)];
    expect(isMediaOnCooldown({ history, now })).toBe(true);
  });

  it("isMediaOnCooldown=false se passou mais de 60s", () => {
    const now = Date.now();
    const history = [mkOutboundMedia(now - 90_000)];
    expect(isMediaOnCooldown({ history, now })).toBe(false);
  });

  describe("filterMediaForTurn", () => {
    it("remove ids já enviados (idempotência)", () => {
      const r = filterMediaForTurn({
        proposedIds: [1, 2],
        alreadySentIds: [1],
        history: [],
      });
      expect(r.allowed).toEqual([2]);
      expect(r.dropped[0]).toEqual({ id: 1, reason: "already-sent" });
    });

    it("aplica cooldown quando a última mídia foi recente", () => {
      const now = Date.now();
      const r = filterMediaForTurn({
        proposedIds: [3],
        alreadySentIds: [],
        history: [mkOutboundMedia(now - 10_000)],
        now,
      });
      expect(r.allowed).toEqual([]);
      expect(r.dropped[0].reason).toBe("cooldown");
    });

    it("limita a 1 mídia por turno", () => {
      const r = filterMediaForTurn({
        proposedIds: [10, 11, 12],
        alreadySentIds: [],
        history: [],
      });
      expect(r.allowed).toEqual([10]);
      expect(r.dropped).toHaveLength(2);
      expect(r.dropped[0].reason).toBe("max-1-per-turn");
      expect(r.dropped[1].reason).toBe("max-1-per-turn");
    });

    it("permite envio quando sem histórico e sem duplicatas", () => {
      const r = filterMediaForTurn({
        proposedIds: [42],
        alreadySentIds: [],
        history: [],
      });
      expect(r.allowed).toEqual([42]);
      expect(r.dropped).toEqual([]);
    });
  });
});

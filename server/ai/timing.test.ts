import { describe, expect, it } from "vitest";
import { isInside24hWindow, isWithinBusinessHours } from "./timing";
import type { BusinessHours, Conversation } from "../../drizzle/schema";

function makeBh(partial: Partial<BusinessHours>): BusinessHours {
  return {
    id: 1,
    agentId: 1,
    enabled: true,
    timezone: "UTC",
    weekly: {
      "0": { start: "00:00", end: "23:59", closed: true }, // dom
      "1": { start: "09:00", end: "18:00" }, // seg
      "2": { start: "09:00", end: "18:00" },
      "3": { start: "09:00", end: "18:00" },
      "4": { start: "09:00", end: "18:00" },
      "5": { start: "09:00", end: "18:00" },
      "6": { start: "00:00", end: "23:59", closed: true },
    },
    outOfHoursMessage: null,
    updatedAt: new Date(),
    ...partial,
  };
}

describe("isWithinBusinessHours", () => {
  it("retorna true quando bh é undefined ou desativado", () => {
    expect(isWithinBusinessHours(undefined)).toBe(true);
    expect(isWithinBusinessHours(makeBh({ enabled: false }))).toBe(true);
  });

  it("considera segunda-feira 14:00 UTC como dentro do expediente", () => {
    // Mon Apr 27 2026 14:00 UTC
    const now = new Date(Date.UTC(2026, 3, 27, 14, 0, 0));
    expect(isWithinBusinessHours(makeBh({}), now)).toBe(true);
  });

  it("considera domingo como fora do expediente", () => {
    // Sun Apr 26 2026 14:00 UTC
    const now = new Date(Date.UTC(2026, 3, 26, 14, 0, 0));
    expect(isWithinBusinessHours(makeBh({}), now)).toBe(false);
  });

  it("considera 22:00 UTC numa segunda como fora", () => {
    const now = new Date(Date.UTC(2026, 3, 27, 22, 0, 0));
    expect(isWithinBusinessHours(makeBh({}), now)).toBe(false);
  });
});

describe("isInside24hWindow", () => {
  it("retorna false sem lastInboundAt", () => {
    expect(isInside24hWindow(undefined)).toBe(false);
    expect(isInside24hWindow({ lastInboundAt: null } as Pick<Conversation, "lastInboundAt">)).toBe(
      false
    );
  });

  it("dentro de 24h retorna true", () => {
    const now = new Date(2026, 3, 27, 14, 0, 0);
    const last = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    expect(
      isInside24hWindow({ lastInboundAt: last } as Pick<Conversation, "lastInboundAt">, now)
    ).toBe(true);
  });

  it("após 24h retorna false", () => {
    const now = new Date(2026, 3, 27, 14, 0, 0);
    const last = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    expect(
      isInside24hWindow({ lastInboundAt: last } as Pick<Conversation, "lastInboundAt">, now)
    ).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { isWithinAllowedWindow, nextAllowedAt } from "./timeWindow";

const at = (h: number, m = 0) => {
  const d = new Date(2026, 3, 28, h, m, 0, 0);
  return d;
};

describe("isWithinAllowedWindow", () => {
  it("sem janela = sempre permitido", () => {
    expect(isWithinAllowedWindow(at(3), { startHour: null, endHour: null })).toBe(true);
    expect(isWithinAllowedWindow(at(3), { startHour: 9, endHour: 9 })).toBe(true);
  });

  it("janela 8..21 permite 8h e 20h, bloqueia 7h e 21h", () => {
    const w = { startHour: 8, endHour: 21 };
    expect(isWithinAllowedWindow(at(7, 59), w)).toBe(false);
    expect(isWithinAllowedWindow(at(8, 0), w)).toBe(true);
    expect(isWithinAllowedWindow(at(20, 59), w)).toBe(true);
    expect(isWithinAllowedWindow(at(21, 0), w)).toBe(false);
  });

  it("janela cruzando meia-noite 22..6 permite 23h e 5h, bloqueia 7h e 21h", () => {
    const w = { startHour: 22, endHour: 6 };
    expect(isWithinAllowedWindow(at(22, 30), w)).toBe(true);
    expect(isWithinAllowedWindow(at(2), w)).toBe(true);
    expect(isWithinAllowedWindow(at(5, 59), w)).toBe(true);
    expect(isWithinAllowedWindow(at(6, 0), w)).toBe(false);
    expect(isWithinAllowedWindow(at(21, 59), w)).toBe(false);
  });
});

describe("nextAllowedAt", () => {
  it("dentro da janela retorna agora", () => {
    const now = at(10);
    expect(nextAllowedAt(now, { startHour: 8, endHour: 21 })).toBe(now.getTime());
  });

  it("antes da janela: retorna hoje no startHour", () => {
    const now = at(6);
    const next = new Date(nextAllowedAt(now, { startHour: 8, endHour: 21 }));
    expect(next.getDate()).toBe(now.getDate());
    expect(next.getHours()).toBe(8);
    expect(next.getMinutes()).toBe(0);
  });

  it("depois da janela: retorna amanhã no startHour", () => {
    const now = at(22);
    const next = new Date(nextAllowedAt(now, { startHour: 8, endHour: 21 }));
    expect(next.getDate()).toBe(now.getDate() + 1);
    expect(next.getHours()).toBe(8);
  });
});

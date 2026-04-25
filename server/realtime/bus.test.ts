import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  publish,
  subscribe,
  subscriberCount,
  _resetForTests,
  type RealtimeEvent,
} from "./bus";

describe("realtime bus", () => {
  beforeEach(() => {
    _resetForTests();
  });

  it("entrega eventos apenas aos assinantes do canal correto", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribe(1, a);
    subscribe(2, b);

    publish({ type: "typing.agent", conversationId: 1, phase: "thinking" });
    publish({ type: "status", conversationId: 2, patch: { aiPaused: true } });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    const aEvt = a.mock.calls[0][0] as RealtimeEvent;
    const bEvt = b.mock.calls[0][0] as RealtimeEvent;
    expect(aEvt.type).toBe("typing.agent");
    expect(aEvt.conversationId).toBe(1);
    expect(bEvt.type).toBe("status");
    expect(bEvt.conversationId).toBe(2);
  });

  it("permite múltiplos assinantes no mesmo canal", () => {
    const x = vi.fn();
    const y = vi.fn();
    subscribe(7, x);
    subscribe(7, y);
    expect(subscriberCount(7)).toBe(2);

    publish({ type: "message", conversationId: 7, message: { id: 99 } });
    expect(x).toHaveBeenCalledTimes(1);
    expect(y).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe remove o assinante e auto-limpa o canal vazio", () => {
    const fn = vi.fn();
    const off = subscribe(42, fn);
    expect(subscriberCount(42)).toBe(1);
    off();
    expect(subscriberCount(42)).toBe(0);

    publish({ type: "typing.agent", conversationId: 42, phase: "writing" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("um subscriber que lança não impede os outros de receberem", () => {
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    subscribe(5, bad);
    subscribe(5, good);

    expect(() =>
      publish({ type: "typing.agent", conversationId: 5, phase: "delivering" })
    ).not.toThrow();
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
  });

  it("publish sem assinantes é no-op silencioso", () => {
    expect(() =>
      publish({ type: "status", conversationId: 999, patch: {} })
    ).not.toThrow();
    expect(subscriberCount(999)).toBe(0);
  });
});

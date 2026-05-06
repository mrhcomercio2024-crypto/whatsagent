import { describe, expect, it, beforeEach } from "vitest";
import {
  publish,
  subscribe,
  subscribeAgent,
  bindConversationToAgent,
  _resetForTests,
  type RealtimeEvent,
  type PipelinePhase,
} from "./bus";

describe("realtime bus — pipeline events", () => {
  beforeEach(() => {
    _resetForTests();
  });

  it("publica e propaga evento pipeline para subscriber da conversa", () => {
    const events: RealtimeEvent[] = [];
    const off = subscribe(42, (e) => events.push(e));

    publish({
      type: "pipeline",
      conversationId: 42,
      phase: "scheduled",
      etaAt: 1_000_000,
      label: "IA começa em 5s",
    });

    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.type).toBe("pipeline");
    if (ev.type === "pipeline") {
      expect(ev.phase).toBe("scheduled");
      expect(ev.etaAt).toBe(1_000_000);
      // auto-stamp
      expect(typeof ev.at).toBe("number");
      expect((ev.at as number) > 0).toBe(true);
    }
    off();
  });

  it("auto-stampa `at` quando publisher não envia", () => {
    const events: RealtimeEvent[] = [];
    subscribe(7, (e) => events.push(e));
    const before = Date.now();
    publish({
      type: "pipeline",
      conversationId: 7,
      phase: "processing",
    });
    const after = Date.now();
    const ev = events[0];
    if (ev.type === "pipeline") {
      expect(ev.at).toBeGreaterThanOrEqual(before);
      expect(ev.at).toBeLessThanOrEqual(after);
    }
  });

  it("preserva `at` se publisher já enviou", () => {
    const events: RealtimeEvent[] = [];
    subscribe(8, (e) => events.push(e));
    publish({
      type: "pipeline",
      conversationId: 8,
      phase: "sent",
      at: 12345,
    });
    const ev = events[0];
    if (ev.type === "pipeline") {
      expect(ev.at).toBe(12345);
    }
  });

  it("propaga pipeline para subscribers globais por agentId via bind", () => {
    bindConversationToAgent(99, 5);
    const agentEvents: RealtimeEvent[] = [];
    subscribeAgent(5, (e) => agentEvents.push(e));

    publish({
      type: "pipeline",
      conversationId: 99,
      phase: "composing",
      label: "IA pensando…",
    });

    expect(agentEvents).toHaveLength(1);
    const ev = agentEvents[0];
    expect(ev.type).toBe("pipeline");
    if (ev.type === "pipeline") expect(ev.phase).toBe("composing");
  });

  it("propaga pipeline ao agente quando agentId é passado direto no publish", () => {
    const agentEvents: RealtimeEvent[] = [];
    subscribeAgent(11, (e) => agentEvents.push(e));

    publish(
      {
        type: "pipeline",
        conversationId: 200,
        phase: "sending",
        messageIndex: 0,
        messageCount: 3,
      },
      11
    );

    expect(agentEvents).toHaveLength(1);
    const ev = agentEvents[0];
    if (ev.type === "pipeline") {
      expect(ev.messageCount).toBe(3);
      expect(ev.messageIndex).toBe(0);
    }
  });

  it("envia eventos de TODAS as 6 fases sem erro", () => {
    const phases: PipelinePhase[] = [
      "scheduled",
      "processing",
      "composing",
      "composed",
      "sending",
      "sent",
    ];
    const events: RealtimeEvent[] = [];
    subscribe(1, (e) => events.push(e));
    for (const phase of phases) {
      publish({ type: "pipeline", conversationId: 1, phase });
    }
    expect(events).toHaveLength(6);
    expect(
      events.map((e) => (e.type === "pipeline" ? e.phase : null))
    ).toEqual(phases);
  });

  it("um subscriber problemático não bloqueia os outros", () => {
    const ok: RealtimeEvent[] = [];
    subscribe(2, () => {
      throw new Error("boom");
    });
    subscribe(2, (e) => ok.push(e));
    publish({ type: "pipeline", conversationId: 2, phase: "sent" });
    expect(ok).toHaveLength(1);
  });

  it("dois subscribers globais recebem o evento", () => {
    const a: RealtimeEvent[] = [];
    const b: RealtimeEvent[] = [];
    subscribeAgent(77, (e) => a.push(e));
    subscribeAgent(77, (e) => b.push(e));
    publish({ type: "pipeline", conversationId: 1, phase: "scheduled" }, 77);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import {
  publish,
  bindConversationToAgent,
  _resetForTests as resetBus,
} from "./bus";
import {
  getActiveSnapshot,
  countActive,
  countTyping,
  _resetForTests as resetLive,
} from "./liveActivity";

function emitMessage(
  conversationId: number,
  agentId: number,
  direction: "inbound" | "outbound",
  text: string
) {
  bindConversationToAgent(conversationId, agentId);
  publish(
    {
      type: "message",
      conversationId,
      message: { direction, text },
    } as any,
    agentId
  );
}

describe("liveActivity", () => {
  beforeEach(() => {
    resetLive();
    resetBus();
  });

  it("registra mensagem inbound e aparece no snapshot", () => {
    // ensureSubscribed ocorre dentro de getActiveSnapshot — chama uma vez antes
    getActiveSnapshot(1);
    emitMessage(100, 1, "inbound", "oi");
    const snap = getActiveSnapshot(1);
    expect(snap.length).toBe(1);
    expect(snap[0].conversationId).toBe(100);
    expect(snap[0].lastMessageText).toBe("oi");
    expect(snap[0].lastMessageDirection).toBe("inbound");
  });

  it("ordena por lastEventAt desc", async () => {
    getActiveSnapshot(1);
    emitMessage(10, 1, "inbound", "a");
    await new Promise((r) => setTimeout(r, 5));
    emitMessage(20, 1, "outbound", "b");
    const snap = getActiveSnapshot(1);
    expect(snap[0].conversationId).toBe(20);
    expect(snap[1].conversationId).toBe(10);
  });

  it("typing.agent writing entra em countTyping.agent", () => {
    getActiveSnapshot(1);
    bindConversationToAgent(50, 1);
    publish({ type: "typing.agent", conversationId: 50, phase: "writing" } as any, 1);
    const t = countTyping(1);
    expect(t.agent).toBe(1);
    expect(t.lead).toBe(0);
  });

  it("typing.agent idle zera o contador", () => {
    getActiveSnapshot(1);
    bindConversationToAgent(50, 1);
    publish({ type: "typing.agent", conversationId: 50, phase: "writing" } as any, 1);
    publish({ type: "typing.agent", conversationId: 50, phase: "idle" } as any, 1);
    expect(countTyping(1).agent).toBe(0);
  });

  it("typing.lead composing entra em countTyping.lead", () => {
    getActiveSnapshot(1);
    bindConversationToAgent(60, 1);
    publish({ type: "typing.lead", conversationId: 60, phase: "composing" } as any, 1);
    expect(countTyping(1).lead).toBe(1);
  });

  it("inbound zera typing do lead", () => {
    getActiveSnapshot(1);
    bindConversationToAgent(70, 1);
    publish({ type: "typing.lead", conversationId: 70, phase: "composing" } as any, 1);
    emitMessage(70, 1, "inbound", "chegou");
    expect(countTyping(1).lead).toBe(0);
  });

  it("outbound zera typing do agente", () => {
    getActiveSnapshot(1);
    bindConversationToAgent(80, 1);
    publish({ type: "typing.agent", conversationId: 80, phase: "writing" } as any, 1);
    emitMessage(80, 1, "outbound", "resp");
    expect(countTyping(1).agent).toBe(0);
  });

  it("isola por agentId", () => {
    getActiveSnapshot(1);
    getActiveSnapshot(2);
    emitMessage(10, 1, "inbound", "a1");
    emitMessage(20, 2, "inbound", "b2");
    expect(getActiveSnapshot(1).length).toBe(1);
    expect(getActiveSnapshot(2).length).toBe(1);
    expect(getActiveSnapshot(1)[0].conversationId).toBe(10);
    expect(getActiveSnapshot(2)[0].conversationId).toBe(20);
  });

  it("countActive devolve total", () => {
    getActiveSnapshot(1);
    emitMessage(1, 1, "inbound", "x");
    emitMessage(2, 1, "outbound", "y");
    emitMessage(3, 1, "inbound", "z");
    expect(countActive(1)).toBe(3);
  });
});

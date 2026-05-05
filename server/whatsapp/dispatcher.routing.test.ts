import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Roteamento de `dispatchActions` por connectionMode.
 *
 * O modo "qr" agora usa Z-API por baixo (Baileys foi descontinuado).
 * O nome do modo é mantido por compatibilidade com agentes existentes.
 */

const scheduleSpy = vi.fn().mockResolvedValue(undefined);
const sendTextSpy = vi.fn().mockResolvedValue({ ok: true, messageId: "wa1" });
const appendSpy = vi.fn().mockResolvedValue(undefined);
const recordMetricSpy = vi.fn().mockResolvedValue(undefined);
const getZapiSpy = vi.fn();

vi.mock("../db", () => ({
  scheduleFollowupJobs: (...args: any[]) => scheduleSpy(...args),
  getConversationById: vi.fn().mockResolvedValue({ id: 10, leadId: 100 }),
  getLeadById: vi.fn().mockResolvedValue({ id: 100, phoneNumber: "5511999999999" }),
  getMediaById: vi.fn(),
  getWhatsappConfig: vi.fn().mockResolvedValue(null),
  getZapiInstance: (...args: any[]) => getZapiSpy(...args),
  recordMetric: (...args: any[]) => recordMetricSpy(...args),
  appendMessage: (...args: any[]) => appendSpy(...args),
  enqueueMessageRetry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./client", () => ({
  sendText: vi.fn(),
  sendImage: vi.fn(),
  sendVideo: vi.fn(),
  sendDocument: vi.fn(),
}));

vi.mock("./zapi", () => ({
  sendText: (...args: any[]) => sendTextSpy(...args),
  sendImage: vi.fn(),
  sendAudio: vi.fn(),
  sendVideo: vi.fn(),
  sendDocument: vi.fn(),
  getStatus: vi.fn(),
}));

import { dispatchActions } from "./dispatcher";
import type { Agent } from "../../drizzle/schema";

function makeAgent(mode: "official" | "qr" | "zapi"): Agent {
  return {
    id: 1,
    name: "Teste",
    description: null,
    status: "active",
    defaultLlmModel: "gpt-4o",
    persona: null,
    language: "pt-BR",
    connectionMode: mode,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Agent;
}

describe("dispatcher routing por connectionMode", () => {
  beforeEach(() => {
    scheduleSpy.mockClear();
    sendTextSpy.mockClear();
    appendSpy.mockClear();
    getZapiSpy.mockClear();
    getZapiSpy.mockResolvedValue({
      agentId: 1,
      instanceId: "inst",
      token: "tok",
      clientToken: null,
      isConnected: true,
    });
  });

  it("modo 'qr' → roteia para Z-API e agenda follow-ups", async () => {
    await dispatchActions({
      agent: makeAgent("qr"),
      conversationId: 1010,
      actions: [{ type: "text", text: "qr-test-msg" }],
      sender: "ai",
    });
    expect(sendTextSpy).toHaveBeenCalledTimes(1);
    expect(scheduleSpy).toHaveBeenCalled();
  });

  it("modo 'zapi' → roteia para Z-API", async () => {
    await dispatchActions({
      agent: makeAgent("zapi"),
      conversationId: 2020,
      actions: [{ type: "text", text: "zapi-test-msg" }],
      sender: "ai",
    });
    expect(sendTextSpy).toHaveBeenCalledTimes(1);
  });

  it("modo 'official' → não usa Z-API", async () => {
    await dispatchActions({
      agent: makeAgent("official"),
      conversationId: 3030,
      actions: [{ type: "text", text: "official-test-msg" }],
      sender: "ai",
    });
    expect(sendTextSpy).not.toHaveBeenCalled();
  });
});

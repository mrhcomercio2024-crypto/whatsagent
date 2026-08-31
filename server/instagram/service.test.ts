import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getIntegration: vi.fn(),
  createEvent: vi.fn(),
  claimEvent: vi.fn(),
  completeEvent: vi.fn(),
  failEvent: vi.fn(),
  log: vi.fn(),
  resolveIdentity: vi.fn(),
  updateIntegration: vi.fn(),
  findMessage: vi.fn(),
  getProfile: vi.fn(),
  decrypt: vi.fn(),
  appendMessage: vi.fn(),
  getAgent: vi.fn(),
  getConversation: vi.fn(),
  recordMetric: vi.fn(),
  setPending: vi.fn(),
  nextProcessAt: vi.fn(),
  dispatchActions: vi.fn(),
}));

vi.mock("./db", () => ({
  getInstagramIntegrationByAccount: mocks.getIntegration,
  createOrGetInstagramEvent: mocks.createEvent,
  claimInstagramEvent: mocks.claimEvent,
  completeInstagramEvent: mocks.completeEvent,
  failInstagramEvent: mocks.failEvent,
  logInstagram: mocks.log,
  resolveInstagramIdentity: mocks.resolveIdentity,
  updateInstagramIntegration: mocks.updateIntegration,
  findInstagramMessageByProviderId: mocks.findMessage,
}));
vi.mock("./client", async importOriginal => {
  const actual = await importOriginal<typeof import("./client")>();
  return { ...actual, getInstagramUserProfile: mocks.getProfile };
});
vi.mock("./crypto", async importOriginal => {
  const actual = await importOriginal<typeof import("./crypto")>();
  return { ...actual, decryptInstagramToken: mocks.decrypt };
});
vi.mock("../db", () => ({
  appendMessage: mocks.appendMessage,
  getAgentById: mocks.getAgent,
  getConversationById: mocks.getConversation,
  recordMetric: mocks.recordMetric,
  setConversationPendingProcessAt: mocks.setPending,
}));
vi.mock("../ai/humanize", () => ({ nextProcessAt: mocks.nextProcessAt }));
vi.mock("../whatsapp/dispatcher", () => ({ dispatchActions: mocks.dispatchActions }));

import { handleInstagramWebhook } from "./service";

const accountId = "17841400000000000";
const senderId = "12345678901234567";

function payload(message: Record<string, unknown>) {
  return {
    object: "instagram",
    entry: [
      {
        id: accountId,
        messaging: [
          {
            sender: { id: senderId },
            recipient: { id: accountId },
            timestamp: Date.now(),
            message,
          },
        ],
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getIntegration.mockResolvedValue({
    id: 10,
    agentId: 1,
    instagramAccountId: accountId,
    accessTokenEncrypted: "encrypted",
  });
  mocks.createEvent.mockResolvedValue({ id: 100 });
  mocks.claimEvent.mockResolvedValue(true);
  mocks.completeEvent.mockResolvedValue(undefined);
  mocks.failEvent.mockResolvedValue(undefined);
  mocks.getProfile.mockResolvedValue({ username: "lead", name: "Lead" });
  mocks.decrypt.mockReturnValue("access-token");
  mocks.resolveIdentity.mockResolvedValue({ leadId: 2, conversationId: 3 });
  mocks.findMessage.mockResolvedValue(null);
  mocks.getAgent.mockResolvedValue({ id: 1 });
  mocks.getConversation.mockResolvedValue({
    id: 3,
    agentId: 1,
    leadId: 2,
    channel: "instagram",
    aiPaused: false,
    status: "open",
  });
  mocks.nextProcessAt.mockReturnValue(new Date());
});

describe("Instagram Webhook pipeline", () => {
  it("persists one inbound and schedules the existing Ravi Core once", async () => {
    await handleInstagramWebhook(payload({ mid: "mid.inbound.1", text: "Quero entender como funciona" }));
    expect(mocks.createEvent).toHaveBeenCalledOnce();
    expect(mocks.appendMessage).toHaveBeenCalledOnce();
    expect(mocks.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "instagram",
        providerMessageId: "mid.inbound.1",
        body: "Quero entender como funciona",
      }),
    );
    expect(mocks.setPending).toHaveBeenCalledOnce();
    expect(mocks.dispatchActions).not.toHaveBeenCalled();
    expect(mocks.completeEvent).toHaveBeenCalledWith("messages:mid.inbound.1", "processed");
  });

  it("does not execute a duplicate event when the persistent claim is unavailable", async () => {
    mocks.claimEvent.mockResolvedValue(false);
    await handleInstagramWebhook(payload({ mid: "mid.duplicate", text: "duplicada" }));
    expect(mocks.appendMessage).not.toHaveBeenCalled();
    expect(mocks.setPending).not.toHaveBeenCalled();
    expect(mocks.dispatchActions).not.toHaveBeenCalled();
  });

  it("ignores is_echo without creating a lead, message or Ravi response", async () => {
    await handleInstagramWebhook(payload({ mid: "mid.echo", text: "eco", is_echo: true }));
    expect(mocks.resolveIdentity).not.toHaveBeenCalled();
    expect(mocks.appendMessage).not.toHaveBeenCalled();
    expect(mocks.setPending).not.toHaveBeenCalled();
    expect(mocks.completeEvent).toHaveBeenCalledWith("messages:mid.echo", "ignored");
  });

  it("persists inbound during handoff but never schedules the Ravi", async () => {
    mocks.getConversation.mockResolvedValue({
      id: 3,
      agentId: 1,
      leadId: 2,
      channel: "instagram",
      aiPaused: true,
      status: "human_handoff",
    });
    await handleInstagramWebhook(payload({ mid: "mid.handoff", text: "Ainda estou aqui" }));
    expect(mocks.appendMessage).toHaveBeenCalledOnce();
    expect(mocks.setPending).not.toHaveBeenCalled();
    expect(mocks.dispatchActions).not.toHaveBeenCalled();
  });

  it("answers unsupported attachments safely without invoking the LLM", async () => {
    await handleInstagramWebhook(
      payload({
        mid: "mid.file",
        attachments: [{ type: "file", payload: { url: "https://cdn.example/file.pdf" } }],
      }),
    );
    expect(mocks.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "document", providerMessageId: "mid.file" }),
    );
    expect(mocks.dispatchActions).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 3,
        actions: [expect.objectContaining({ type: "text" })],
      }),
    );
    expect(mocks.setPending).not.toHaveBeenCalled();
  });

  it("records a structured failure without acknowledging it as processed internally", async () => {
    mocks.resolveIdentity.mockRejectedValue(new Error("IDENTITY_FAILED"));
    await expect(
      handleInstagramWebhook(payload({ mid: "mid.failed", text: "erro" })),
    ).rejects.toThrow("IDENTITY_FAILED");
    expect(mocks.failEvent).toHaveBeenCalledWith(
      "messages:mid.failed",
      expect.objectContaining({ message: "IDENTITY_FAILED" }),
    );
    expect(mocks.completeEvent).not.toHaveBeenCalled();
  });
});

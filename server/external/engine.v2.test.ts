import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * Testes do caminho v2 do engine de Eventos Externos.
 *
 * Mockamos `../db`, `../whatsapp/dispatcher` e `../whatsapp/client` para
 * verificar que `executeRuleActions` em modo v2 aplica tag/move/contexto e
 * tenta envio de template via Cloud API com erro previsível quando faltam
 * credenciais.
 */

const updateLeadMock = vi.fn();
const updateConversationMock = vi.fn();
const findOrCreateConversationMock = vi.fn().mockResolvedValue(101);
const recordMetricMock = vi.fn();
const appendMessageMock = vi.fn();
const getAgentByIdMock = vi
  .fn()
  .mockResolvedValue({ id: 1, name: "Agent X", persona: "" });
const getWhatsappConfigMock = vi.fn();
const getTemplateByIdMock = vi.fn();
const sendTemplateMock = vi.fn();
const dispatchActionsMock = vi.fn();
const notifyOwnerMock = vi.fn();
const invokeLLMMock = vi.fn();

vi.mock("../db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              { id: 5, name: "L", phoneNumber: "+5511", email: null, tags: null },
            ]),
        }),
      }),
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  })),
  getAgentById: (...a: any[]) => getAgentByIdMock(...a),
  findOrCreateConversation: (...a: any[]) => findOrCreateConversationMock(...a),
  updateConversation: (...a: any[]) => updateConversationMock(...a),
  updateLead: (...a: any[]) => updateLeadMock(...a),
  appendMessage: (...a: any[]) => appendMessageMock(...a),
  recordMetric: (...a: any[]) => recordMetricMock(...a),
  getWhatsappConfig: (...a: any[]) => getWhatsappConfigMock(...a),
  getTemplateById: (...a: any[]) => getTemplateByIdMock(...a),
}));

vi.mock("../whatsapp/dispatcher", () => ({
  dispatchActions: (...a: any[]) => dispatchActionsMock(...a),
}));

vi.mock("../whatsapp/client", () => ({
  sendTemplate: (...a: any[]) => sendTemplateMock(...a),
}));

vi.mock("../_core/notification", () => ({
  notifyOwner: (...a: any[]) => notifyOwnerMock(...a),
}));

vi.mock("../_core/llm", () => ({
  invokeLLM: (...a: any[]) => invokeLLMMock(...a),
}));

beforeEach(() => {
  updateLeadMock.mockClear();
  updateConversationMock.mockClear();
  recordMetricMock.mockClear();
  appendMessageMock.mockClear();
  getWhatsappConfigMock.mockReset();
  getTemplateByIdMock.mockReset();
  sendTemplateMock.mockReset();
  dispatchActionsMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("engine v2: executeRuleActions", () => {
  it("aplica tag, mover etapa e contexto IA SEM disparar template", async () => {
    const { executeRuleActions } = await import("./engine");
    const rule: any = {
      id: 1,
      agentId: 1,
      sourceId: null,
      eventType: "purchase.completed",
      name: "R",
      enabled: true,
      isActive: true,
      actions: [{ kind: "v2" }],
      delayMinutes: 0,
      moveToStepId: 7,
      tagLabel: "Cliente VIP",
      aiContext: "Veio do anúncio Black Friday",
      channelAgentId: null,
      templateId: null,
    };
    const applied = await executeRuleActions({
      agentId: 1,
      leadId: 5,
      eventType: "purchase.completed",
      rule,
      payload: {},
    });

    const kinds = applied.map((a) => a.kind).sort();
    expect(kinds).toEqual(["addTag", "aiContext", "moveToStep"]);
    expect(applied.every((a) => a.ok)).toBe(true);

    expect(updateLeadMock).toHaveBeenCalledWith(5, { tags: "Cliente VIP" });
    expect(updateConversationMock).toHaveBeenCalledWith(101, { currentStepId: 7 });
    expect(sendTemplateMock).not.toHaveBeenCalled();
    expect(dispatchActionsMock).not.toHaveBeenCalled();
    expect(recordMetricMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "external_event_processed",
        metadata: expect.objectContaining({ mode: "v2" }),
      })
    );
  });

  it("falha com mensagem clara quando canal não tem credenciais Cloud API", async () => {
    getWhatsappConfigMock.mockResolvedValue({ phoneNumberId: null, accessToken: null });
    getTemplateByIdMock.mockResolvedValue({
      id: 9,
      name: "boas_vindas",
      languageCode: "pt_BR",
      bodyText: "Olá",
    });

    const { executeRuleActions } = await import("./engine");
    const rule: any = {
      id: 2,
      agentId: 1,
      sourceId: null,
      eventType: "purchase.completed",
      name: "R2",
      enabled: true,
      isActive: true,
      actions: [{ kind: "v2" }],
      delayMinutes: 0,
      moveToStepId: null,
      tagLabel: null,
      aiContext: null,
      channelAgentId: 99,
      templateId: 9,
    };

    const applied = await executeRuleActions({
      agentId: 1,
      leadId: 5,
      eventType: "purchase.completed",
      rule,
      payload: {},
    });

    const sendT = applied.find((a) => a.kind === "sendTemplate");
    expect(sendT?.ok).toBe(false);
    expect(sendT?.error).toMatch(/credenciais/i);
    expect(sendTemplateMock).not.toHaveBeenCalled();
  });

  it("envia template via Cloud API quando canal tem credenciais e registra mensagem", async () => {
    getWhatsappConfigMock.mockResolvedValue({
      phoneNumberId: "PNID",
      accessToken: "TOK",
      appSecret: null,
    });
    getTemplateByIdMock.mockResolvedValue({
      id: 9,
      name: "boas_vindas",
      languageCode: "pt_BR",
      bodyText: "Olá!",
    });
    sendTemplateMock.mockResolvedValue({ ok: true, messageId: "wamid.123" });

    const { executeRuleActions } = await import("./engine");
    const rule: any = {
      id: 3,
      agentId: 1,
      sourceId: null,
      eventType: "purchase.completed",
      name: "R3",
      enabled: true,
      isActive: true,
      actions: [{ kind: "v2" }],
      delayMinutes: 0,
      moveToStepId: null,
      tagLabel: null,
      aiContext: null,
      channelAgentId: 99,
      templateId: 9,
    };

    const applied = await executeRuleActions({
      agentId: 1,
      leadId: 5,
      eventType: "purchase.completed",
      rule,
      payload: {},
    });

    expect(sendTemplateMock).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNumberId: "PNID", accessToken: "TOK" }),
      "+5511",
      "boas_vindas",
      "pt_BR",
      []
    );
    const sendT = applied.find((a) => a.kind === "sendTemplate");
    expect(sendT?.ok).toBe(true);
    expect(appendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 101,
        direction: "outbound",
        contentType: "template",
        templateName: "boas_vindas",
        waMessageId: "wamid.123",
      })
    );
  });

  it("agenda execução quando delayMinutes > 0 e não executa imediatamente", async () => {
    vi.useFakeTimers();
    const { executeRuleActions, _clearPendingTimers } = await import("./engine");
    const rule: any = {
      id: 4,
      agentId: 1,
      sourceId: null,
      eventType: "purchase.completed",
      name: "R4",
      enabled: true,
      isActive: true,
      actions: [{ kind: "v2" }],
      delayMinutes: 5,
      moveToStepId: 7,
      tagLabel: null,
      aiContext: null,
      channelAgentId: null,
      templateId: null,
    };
    const applied = await executeRuleActions({
      agentId: 1,
      leadId: 5,
      eventType: "purchase.completed",
      rule,
      payload: {},
    });
    expect(applied[0]?.kind).toBe("v2.scheduled");
    expect(updateConversationMock).not.toHaveBeenCalled();
    _clearPendingTimers();
  });
});

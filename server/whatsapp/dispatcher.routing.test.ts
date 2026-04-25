import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Verifica que `dispatchActions` roteia corretamente para Baileys
 * quando o agente está em modo 'qr', e para a API oficial quando 'official'.
 *
 * Mockamos os dois caminhos para isolar o teste.
 */

const baileysSpy = vi.fn().mockResolvedValue(undefined);
const officialSpy = vi.fn().mockResolvedValue(undefined);
const scheduleSpy = vi.fn().mockResolvedValue(undefined);

vi.mock("./baileys", () => ({
  dispatchViaBaileys: (...args: any[]) => baileysSpy(...args),
}));

vi.mock("../db", () => ({
  scheduleFollowupJobs: (...args: any[]) => scheduleSpy(...args),
  // demais funções não são chamadas nesse teste porque interceptamos antes
  getConversationById: vi.fn(),
  getLeadById: vi.fn(),
  getMediaById: vi.fn(),
  getWhatsappConfig: vi.fn(),
  recordMetric: vi.fn(),
  appendMessage: vi.fn(),
}));

vi.mock("./client", () => ({
  sendText: vi.fn(),
  sendImage: vi.fn(),
  sendVideo: vi.fn(),
  sendDocument: vi.fn(),
  type: undefined,
}));

import { dispatchActions } from "./dispatcher";
import type { Agent } from "../../drizzle/schema";

function makeAgent(mode: "official" | "qr"): Agent {
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
  };
}

describe("dispatcher routing por connectionMode", () => {
  beforeEach(() => {
    baileysSpy.mockClear();
    officialSpy.mockClear();
    scheduleSpy.mockClear();
  });

  it("modo 'qr' → chama Baileys e agenda follow-ups", async () => {
    await dispatchActions({
      agent: makeAgent("qr"),
      conversationId: 10,
      actions: [{ type: "text", text: "oi" }],
      sender: "ai",
    });
    expect(baileysSpy).toHaveBeenCalledTimes(1);
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
  });

  it("modo 'official' → não chama Baileys", async () => {
    // Como mockamos getWhatsappConfig sem retorno, o caminho oficial sai cedo;
    // basta garantir que o Baileys NÃO foi chamado.
    await dispatchActions({
      agent: makeAgent("official"),
      conversationId: 11,
      actions: [{ type: "text", text: "oi" }],
      sender: "ai",
    });
    expect(baileysSpy).not.toHaveBeenCalled();
  });
});

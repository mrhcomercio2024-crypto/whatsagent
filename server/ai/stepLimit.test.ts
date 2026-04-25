import { describe, it, expect } from "vitest";
import {
  shouldAutoAdvanceByCount,
  countAiMessagesInCurrentStep,
} from "./stepLimit";

describe("shouldAutoAdvanceByCount", () => {
  it("retorna false quando não há limite definido", () => {
    expect(shouldAutoAdvanceByCount(10, null)).toBe(false);
    expect(shouldAutoAdvanceByCount(10, undefined)).toBe(false);
    expect(shouldAutoAdvanceByCount(10, 0)).toBe(false);
    expect(shouldAutoAdvanceByCount(10, -3)).toBe(false);
  });

  it("retorna true exatamente ao atingir o teto", () => {
    expect(shouldAutoAdvanceByCount(2, 3)).toBe(false);
    expect(shouldAutoAdvanceByCount(3, 3)).toBe(true);
    expect(shouldAutoAdvanceByCount(4, 3)).toBe(true);
  });

  it("trata entradas inválidas com segurança", () => {
    expect(shouldAutoAdvanceByCount(NaN, 3)).toBe(false);
    expect(shouldAutoAdvanceByCount(-1, 3)).toBe(false);
    expect(shouldAutoAdvanceByCount(2, NaN as any)).toBe(false);
  });
});

describe("countAiMessagesInCurrentStep", () => {
  const t = (offset: number) => new Date(1700000000000 + offset);

  it("retorna 0 sem etapa atual", () => {
    expect(
      countAiMessagesInCurrentStep({
        messages: [
          {
            direction: "outbound",
            sender: "ai",
            metadata: { stepId: 1 },
            createdAt: t(0),
          },
        ],
        currentStepId: null,
      })
    ).toBe(0);
  });

  it("conta apenas outbound da IA na etapa atual via metadata.stepId", () => {
    const msgs = [
      { direction: "outbound" as const, sender: "ai" as const, metadata: { stepId: 1 }, createdAt: t(1) },
      { direction: "outbound" as const, sender: "ai" as const, metadata: { stepId: 1 }, createdAt: t(2) },
      { direction: "outbound" as const, sender: "ai" as const, metadata: { stepId: 2 }, createdAt: t(3) },
      { direction: "inbound" as const, sender: "lead" as const, metadata: { stepId: 1 }, createdAt: t(4) },
      { direction: "outbound" as const, sender: "human" as const, metadata: { stepId: 1 }, createdAt: t(5) },
    ];
    expect(
      countAiMessagesInCurrentStep({ messages: msgs, currentStepId: 1 })
    ).toBe(2);
    expect(
      countAiMessagesInCurrentStep({ messages: msgs, currentStepId: 2 })
    ).toBe(1);
  });

  it("usa fallback temporal quando nenhuma mensagem tem metadata.stepId", () => {
    const since = t(100).getTime();
    const msgs = [
      { direction: "outbound" as const, sender: "ai" as const, createdAt: t(50) }, // antes do início da etapa
      { direction: "outbound" as const, sender: "ai" as const, createdAt: t(150) },
      { direction: "outbound" as const, sender: "ai" as const, createdAt: t(200) },
      { direction: "inbound" as const, sender: "lead" as const, createdAt: t(180) },
    ];
    expect(
      countAiMessagesInCurrentStep({
        messages: msgs,
        currentStepId: 1,
        conversationCurrentStepSince: since,
      })
    ).toBe(2);
  });

  it("sem marcador e sem metadata, conta todas as mensagens da IA", () => {
    const msgs = [
      { direction: "outbound" as const, sender: "ai" as const, createdAt: t(1) },
      { direction: "outbound" as const, sender: "ai" as const, createdAt: t(2) },
      { direction: "outbound" as const, sender: "human" as const, createdAt: t(3) },
    ];
    expect(
      countAiMessagesInCurrentStep({ messages: msgs, currentStepId: 1 })
    ).toBe(2);
  });
});

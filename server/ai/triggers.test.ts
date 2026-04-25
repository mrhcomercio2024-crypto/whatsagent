import { describe, expect, it } from "vitest";
import {
  detectKeywordTriggers,
  detectStepTriggers,
  getAvailableMediaForPrompt,
} from "./triggers";
import type { MediaTrigger, MediaAsset } from "../../drizzle/schema";

function trig(partial: Partial<MediaTrigger>): MediaTrigger {
  const base: MediaTrigger = {
    id: 1,
    agentId: 1,
    mediaId: 100,
    triggerType: "keyword",
    keywords: null,
    stepId: null,
    sendOncePerConversation: true,
    isActive: true,
    createdAt: new Date(),
  };
  return { ...base, ...partial };
}

describe("detectKeywordTriggers", () => {
  it("captura mídia quando palavra-chave aparece (case + acento insensível)", () => {
    const triggers = [
      trig({ id: 1, mediaId: 10, keywords: "Preço, valor" }),
      trig({ id: 2, mediaId: 20, keywords: "garantia" }),
    ];
    const ids = detectKeywordTriggers(triggers, "Qual o preço?", []);
    expect(ids).toEqual([10]);
    const ids2 = detectKeywordTriggers(triggers, "Tem garantia?", []);
    expect(ids2).toEqual([20]);
    const ids3 = detectKeywordTriggers(triggers, "Quero saber o VALOR", []);
    expect(ids3).toEqual([10]);
  });

  it("ignora gatilhos inativos e respeita sendOncePerConversation", () => {
    const triggers = [
      trig({ id: 1, mediaId: 10, keywords: "preço", isActive: false }),
      trig({ id: 2, mediaId: 20, keywords: "preço", sendOncePerConversation: true }),
    ];
    expect(detectKeywordTriggers(triggers, "preço", [20])).toEqual([]);
    expect(detectKeywordTriggers(triggers, "preço", [])).toEqual([20]);
  });

  it("ignora gatilhos não-keyword", () => {
    const triggers = [trig({ triggerType: "step", stepId: 5, mediaId: 99 })];
    expect(detectKeywordTriggers(triggers, "qualquer coisa", [])).toEqual([]);
  });
});

describe("detectStepTriggers", () => {
  it("envia mídia da etapa atual", () => {
    const triggers = [
      trig({ id: 1, triggerType: "step", stepId: 5, mediaId: 50 }),
      trig({ id: 2, triggerType: "step", stepId: 6, mediaId: 60 }),
    ];
    expect(detectStepTriggers(triggers, 5, [])).toEqual([50]);
  });

  it("não envia se já enviado e once=true", () => {
    const triggers = [trig({ triggerType: "step", stepId: 5, mediaId: 50 })];
    expect(detectStepTriggers(triggers, 5, [50])).toEqual([]);
  });
});

describe("getAvailableMediaForPrompt", () => {
  it("anexa hint legível com tipo de gatilho", () => {
    const triggers = [
      trig({ id: 1, mediaId: 10, triggerType: "keyword", keywords: "preço" }),
      trig({ id: 2, mediaId: 10, triggerType: "ai_decision" }),
      trig({ id: 3, mediaId: 20, triggerType: "step", stepId: 9 }),
    ];
    const media: MediaAsset[] = [
      {
        id: 10,
        agentId: 1,
        name: "Tabela",
        description: null,
        mediaType: "image",
        storageKey: "k1",
        storageUrl: "/manus-storage/k1",
        mimeType: "image/png",
        caption: null,
        createdAt: new Date(),
      },
      {
        id: 20,
        agentId: 1,
        name: "Demo",
        description: null,
        mediaType: "video",
        storageKey: "k2",
        storageUrl: "/manus-storage/k2",
        mimeType: "video/mp4",
        caption: null,
        createdAt: new Date(),
      },
    ];
    const result = getAvailableMediaForPrompt(triggers, media);
    expect(result.find(m => m.id === 10)?.triggerHint).toContain("palavras-chave");
    expect(result.find(m => m.id === 10)?.triggerHint).toContain("decisão da IA");
    expect(result.find(m => m.id === 20)?.triggerHint).toContain("etapa: #9");
  });
});

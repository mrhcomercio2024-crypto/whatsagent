import { describe, it, expect } from "vitest";
import { resolveMediaIdsFromIntents } from "./intentClassifier";

type T = Parameters<typeof resolveMediaIdsFromIntents>[0][number];

function t(overrides: Partial<T> = {}): T {
  return {
    triggerType: "intent",
    isActive: true,
    mediaId: 1,
    intentLabel: "duvida_preco",
    sendOncePerConversation: true,
    ...overrides,
  };
}

describe("resolveMediaIdsFromIntents()", () => {
  it("retorna [] quando labels está vazio", () => {
    expect(resolveMediaIdsFromIntents([t()], [])).toEqual([]);
  });

  it("retorna [] quando triggers está vazio", () => {
    expect(resolveMediaIdsFromIntents([], ["duvida_preco"])).toEqual([]);
  });

  it("resolve mediaId quando label bate", () => {
    const r = resolveMediaIdsFromIntents(
      [t({ mediaId: 42, intentLabel: "duvida_preco" })],
      ["duvida_preco"]
    );
    expect(r).toEqual([42]);
  });

  it("ignora triggers inativos", () => {
    const r = resolveMediaIdsFromIntents(
      [t({ isActive: false, mediaId: 1 })],
      ["duvida_preco"]
    );
    expect(r).toEqual([]);
  });

  it("ignora triggers com triggerType diferente de 'intent'", () => {
    const r = resolveMediaIdsFromIntents(
      [t({ triggerType: "keyword", mediaId: 1 })],
      ["duvida_preco"]
    );
    expect(r).toEqual([]);
  });

  it("respeita sendOncePerConversation com alreadySentMediaIds", () => {
    const r = resolveMediaIdsFromIntents(
      [t({ mediaId: 7, sendOncePerConversation: true })],
      ["duvida_preco"],
      [7]
    );
    expect(r).toEqual([]);
  });

  it("NÃO respeita alreadySent quando sendOncePerConversation é false", () => {
    const r = resolveMediaIdsFromIntents(
      [t({ mediaId: 7, sendOncePerConversation: false })],
      ["duvida_preco"],
      [7]
    );
    expect(r).toEqual([7]);
  });

  it("deduplica ids repetidos", () => {
    const r = resolveMediaIdsFromIntents(
      [
        t({ mediaId: 5, intentLabel: "duvida_preco" }),
        t({ mediaId: 5, intentLabel: "outro_label" }),
      ],
      ["duvida_preco", "outro_label"]
    );
    expect(r).toEqual([5]);
  });

  it("trim nas labels detectadas", () => {
    const r = resolveMediaIdsFromIntents(
      [t({ mediaId: 9 })],
      ["  duvida_preco  "]
    );
    expect(r).toEqual([9]);
  });

  it("ignora intentLabel null no trigger", () => {
    const r = resolveMediaIdsFromIntents(
      [t({ intentLabel: null })],
      ["duvida_preco"]
    );
    expect(r).toEqual([]);
  });
});

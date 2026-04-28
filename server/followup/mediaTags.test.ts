import { describe, it, expect } from "vitest";
import { extractMediaTags, resolveMediaByName } from "./mediaTags";

describe("extractMediaTags", () => {
  it("retorna vazio para texto sem tags", () => {
    const r = extractMediaTags("Olá tudo bem?");
    expect(r.cleanText).toBe("Olá tudo bem?");
    expect(r.tags).toEqual([]);
    expect(r.uniqueNames).toEqual([]);
  });

  it("extrai uma tag e remove do texto", () => {
    const r = extractMediaTags("Manda @midia[membros.mp4] aí");
    expect(r.uniqueNames).toEqual(["membros.mp4"]);
    expect(r.cleanText).toBe("Manda aí");
  });

  it("extrai múltiplas tags preservando ordem e remove duplicatas no uniqueNames", () => {
    const r = extractMediaTags(
      "Use @midia[A.png] e depois @midia[B.mp4] e de novo @midia[a.png]"
    );
    expect(r.tags.map(t => t.name)).toEqual(["A.png", "B.mp4", "a.png"]);
    expect(r.uniqueNames).toEqual(["A.png", "B.mp4"]);
  });

  it("aceita null e undefined", () => {
    expect(extractMediaTags(null).uniqueNames).toEqual([]);
    expect(extractMediaTags(undefined).uniqueNames).toEqual([]);
  });

  it("ignora colchetes vazios", () => {
    const r = extractMediaTags("texto @midia[] mais @midia[ok.mp4]");
    expect(r.uniqueNames).toEqual(["ok.mp4"]);
  });
});

describe("resolveMediaByName", () => {
  const lib = [
    { id: 1, name: "membros.mp4", description: "Vídeo de membros" },
    { id: 2, name: "logo.png", description: null },
    { id: 3, name: "audio.mp3", description: "Áudio promo" },
  ];

  it("resolve por filename case-insensitive", () => {
    const r = resolveMediaByName(["MEMBROS.MP4"], lib);
    expect(r.map(m => m.id)).toEqual([1]);
  });

  it("resolve por description quando filename não casa", () => {
    const r = resolveMediaByName(["áudio promo"], lib);
    expect(r.map(m => m.id)).toEqual([3]);
  });

  it("resolve sem extensão como fallback", () => {
    const r = resolveMediaByName(["membros"], lib);
    expect(r.map(m => m.id)).toEqual([1]);
  });

  it("preserva ordem do input e remove duplicatas", () => {
    const r = resolveMediaByName(["logo.png", "membros.mp4", "logo.png"], lib);
    expect(r.map(m => m.id)).toEqual([2, 1]);
  });

  it("ignora nomes não encontrados", () => {
    const r = resolveMediaByName(["inexistente.gif"], lib);
    expect(r).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import {
  wrapSelection,
  prefixLines,
  insertLink,
} from "../../client/src/lib/markdownInsert";

describe("wrapSelection", () => {
  it("envolve a seleção com prefixo e sufixo", () => {
    const r = wrapSelection("ola mundo", { start: 4, end: 9 }, "**", "**");
    expect(r.value).toBe("ola **mundo**");
    // Seleção continua sobre o conteúdo (sem prefixo/sufixo).
    expect(r.value.slice(r.selection.start, r.selection.end)).toBe("mundo");
  });

  it("insere placeholder selecionado quando não há seleção", () => {
    const r = wrapSelection("", { start: 0, end: 0 }, "*", "*");
    expect(r.value).toBe("*texto*");
    expect(r.value.slice(r.selection.start, r.selection.end)).toBe("texto");
  });

  it("não altera o conteúdo fora da seleção", () => {
    const r = wrapSelection(
      "antes [meio] depois",
      { start: 7, end: 11 },
      "_",
      "_"
    );
    expect(r.value).toBe("antes [_meio_] depois");
  });
});

describe("prefixLines", () => {
  it("prefixa cada linha de um bloco selecionado", () => {
    const text = "a\nb\nc";
    const r = prefixLines(text, { start: 0, end: 5 }, "- ");
    expect(r.value).toBe("- a\n- b\n- c");
  });

  it("não duplica prefixo em linhas que já o possuem", () => {
    const text = "- a\nb";
    const r = prefixLines(text, { start: 0, end: text.length }, "- ");
    expect(r.value).toBe("- a\n- b");
  });

  it("atua na linha atual quando não há seleção", () => {
    const text = "linha1\nlinha2";
    // Cursor no meio de "linha2"
    const r = prefixLines(text, { start: 9, end: 9 }, "## ");
    expect(r.value).toBe("linha1\n## linha2");
  });
});

describe("insertLink", () => {
  it("usa a seleção como label do link", () => {
    const r = insertLink("clique aqui", { start: 7, end: 11 }, "https://x.io");
    expect(r.value).toBe("clique [aqui](https://x.io)");
    expect(r.value.slice(r.selection.start, r.selection.end)).toBe("https://x.io");
  });

  it("usa 'link' como label padrão quando não há seleção", () => {
    const r = insertLink("", { start: 0, end: 0 });
    expect(r.value).toBe("[link](https://)");
    expect(r.value.slice(r.selection.start, r.selection.end)).toBe("https://");
  });
});

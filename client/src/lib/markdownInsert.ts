/**
 * Utilitários puros para inserir/wrapping de markdown em torno do cursor
 * ou da seleção atual de um textarea. Mantidos puros para facilitar testes.
 */

export type Selection = { start: number; end: number };

export type InsertResult = {
  value: string;
  selection: Selection;
};

/**
 * Envolve a seleção com prefixo+sufixo (ex.: **texto**).
 * Se não há seleção, insere placeholder e seleciona ele.
 */
export function wrapSelection(
  text: string,
  sel: Selection,
  prefix: string,
  suffix: string,
  placeholder = "texto"
): InsertResult {
  const before = text.slice(0, sel.start);
  const middle = text.slice(sel.start, sel.end);
  const after = text.slice(sel.end);
  if (middle.length === 0) {
    const value = before + prefix + placeholder + suffix + after;
    return {
      value,
      selection: {
        start: before.length + prefix.length,
        end: before.length + prefix.length + placeholder.length,
      },
    };
  }
  const value = before + prefix + middle + suffix + after;
  return {
    value,
    selection: {
      start: before.length + prefix.length,
      end: before.length + prefix.length + middle.length,
    },
  };
}

/**
 * Insere prefixo no início de cada linha da seleção (listas, títulos).
 * Se não há seleção, atua na linha atual.
 */
export function prefixLines(
  text: string,
  sel: Selection,
  linePrefix: string
): InsertResult {
  // Expande a seleção para abranger linhas completas.
  const lineStart = text.lastIndexOf("\n", sel.start - 1) + 1;
  let lineEnd = text.indexOf("\n", sel.end);
  if (lineEnd === -1) lineEnd = text.length;
  const block = text.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  const newBlock = lines
    .map(l => (l.startsWith(linePrefix) ? l : linePrefix + l))
    .join("\n");
  const value = text.slice(0, lineStart) + newBlock + text.slice(lineEnd);
  return {
    value,
    selection: {
      start: lineStart,
      end: lineStart + newBlock.length,
    },
  };
}

/**
 * Insere um link markdown [texto](url). Se há seleção, vira o texto.
 */
export function insertLink(
  text: string,
  sel: Selection,
  url = "https://"
): InsertResult {
  const before = text.slice(0, sel.start);
  const middle = text.slice(sel.start, sel.end);
  const after = text.slice(sel.end);
  const label = middle.length > 0 ? middle : "link";
  const snippet = `[${label}](${url})`;
  const value = before + snippet + after;
  // Seleciona a URL para o usuário poder substituir rapidamente.
  const urlStart = before.length + 1 + label.length + 2;
  return {
    value,
    selection: { start: urlStart, end: urlStart + url.length },
  };
}

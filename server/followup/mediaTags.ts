/**
 * Parser para tags @midia[nome] dentro de instruções de follow-up.
 *
 * O usuário escreve no campo de instrução algo como:
 *   "Envie o vídeo @midia[membros.mp4] e fale que…"
 *
 * Esta função extrai todas as ocorrências, devolve o texto limpo
 * (sem as tags) e a lista de nomes referenciados, na ordem em que
 * aparecem (com duplicatas removidas).
 */

export type ExtractedMediaTag = {
  /** Nome cru entre colchetes, ex: "membros.mp4" */
  name: string;
  /** Posição (em chars) da ocorrência no texto original. */
  position: number;
};

const TAG_REGEX = /@midia\[([^\]]+)\]/gi;

export function extractMediaTags(text: string | null | undefined): {
  cleanText: string;
  tags: ExtractedMediaTag[];
  uniqueNames: string[];
} {
  if (!text) return { cleanText: "", tags: [], uniqueNames: [] };
  const tags: ExtractedMediaTag[] = [];
  let m: RegExpExecArray | null;
  TAG_REGEX.lastIndex = 0;
  while ((m = TAG_REGEX.exec(text)) !== null) {
    const name = m[1].trim();
    if (name.length > 0) {
      tags.push({ name, position: m.index });
    }
  }
  // Remove as tags do texto e normaliza espaços duplicados.
  const cleanText = text
    .replace(TAG_REGEX, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim();
  const seen = new Set<string>();
  const uniqueNames: string[] = [];
  for (const t of tags) {
    const key = t.name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueNames.push(t.name);
    }
  }
  return { cleanText, tags, uniqueNames };
}

/**
 * Resolve nomes de mídia para registros do banco (case-insensitive).
 * Recebe a lista completa de mídias do agente e devolve as que casam,
 * preservando a ordem do parâmetro `names`.
 */
export function resolveMediaByName<
  T extends {
    id: number;
    name?: string | null;
    filename?: string | null;
    description?: string | null;
  }
>(names: string[], mediaList: T[]): T[] {
  if (names.length === 0) return [];
  // Index por name (campo principal), fallback por filename e description
  const byName = new Map<string, T>();
  const byDescription = new Map<string, T>();
  for (const m of mediaList) {
    const n = (m.name ?? m.filename ?? "").trim().toLowerCase();
    if (n) byName.set(n, m);
    const desc = (m.description ?? "").trim().toLowerCase();
    if (desc) byDescription.set(desc, m);
  }
  const out: T[] = [];
  const usedIds = new Set<number>();
  for (const raw of names) {
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    let m = byName.get(key) ?? byDescription.get(key);
    if (!m) {
      // tenta sem extensão
      const noExt = key.replace(/\.[a-z0-9]+$/i, "");
      for (const cand of mediaList) {
        const n = (cand.name ?? cand.filename ?? "").toLowerCase().replace(/\.[a-z0-9]+$/i, "");
        if (n === noExt) {
          m = cand;
          break;
        }
      }
    }
    if (m && !usedIds.has(m.id)) {
      out.push(m);
      usedIds.add(m.id);
    }
  }
  return out;
}

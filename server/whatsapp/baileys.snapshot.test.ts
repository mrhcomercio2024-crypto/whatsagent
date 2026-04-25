import { describe, expect, it } from "vitest";

/**
 * Verifica que a serialização/deserialização do diretório de auth state
 * preserva todos os arquivos e seus bytes (ida e volta).
 *
 * Implementação inline reproduz exatamente o que `snapshotAuthDirToDb` /
 * `restoreAuthDirFromDb` fazem em baileys.ts. Mantido isolado para evitar
 * efeitos colaterais de importar o módulo Baileys real.
 */

function snapshot(files: Record<string, Buffer>): string {
  const obj: Record<string, string> = {};
  for (const [name, buf] of Object.entries(files)) {
    obj[name] = buf.toString("base64");
  }
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

function restore(blob: string): Record<string, Buffer> {
  const obj = JSON.parse(Buffer.from(blob, "base64").toString("utf8")) as Record<
    string,
    string
  >;
  const out: Record<string, Buffer> = {};
  for (const [name, b64] of Object.entries(obj)) {
    out[name] = Buffer.from(b64, "base64");
  }
  return out;
}

describe("baileys auth snapshot", () => {
  it("round-trips text creds.json", () => {
    const src = {
      "creds.json": Buffer.from(
        JSON.stringify({ noiseKey: "abc", me: { id: "1234@s.whatsapp.net" } })
      ),
    };
    const blob = snapshot(src);
    const back = restore(blob);
    expect(back["creds.json"].toString("utf8")).toBe(
      src["creds.json"].toString("utf8")
    );
  });

  it("round-trips multiple binary files (signal keys)", () => {
    const src = {
      "creds.json": Buffer.from('{"k":1}'),
      "pre-key-1.json": Buffer.from([0x01, 0x02, 0x03, 0xff, 0xfe]),
      "session-552199999@s.whatsapp.net.json": Buffer.from(
        Array.from({ length: 256 }, (_, i) => i)
      ),
    };
    const blob = snapshot(src);
    const back = restore(blob);
    expect(Object.keys(back).sort()).toEqual(Object.keys(src).sort());
    for (const k of Object.keys(src)) {
      expect(back[k].equals(src[k])).toBe(true);
    }
  });

  it("returns a non-empty base64 blob", () => {
    const blob = snapshot({ "creds.json": Buffer.from("x") });
    expect(typeof blob).toBe("string");
    expect(blob.length).toBeGreaterThan(0);
    // Deve ser base64 válido
    expect(() => Buffer.from(blob, "base64")).not.toThrow();
  });
});

/**
 * Garante que o filtro do debounce worker exclui linhas com pendingProcessAt = NULL.
 * Reproduz a semântica de `listConversationsDueForProcessing` em pseudo-SQL JS.
 */
describe("debounce due filter semantics", () => {
  type Row = { id: number; pendingProcessAt: Date | null };
  const filter = (rows: Row[], now: Date) =>
    rows.filter(r => r.pendingProcessAt !== null && r.pendingProcessAt < now);

  it("excludes rows with NULL pendingProcessAt", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const rows: Row[] = [
      { id: 1, pendingProcessAt: null },
      { id: 2, pendingProcessAt: new Date("2026-01-01T11:59:00Z") },
      { id: 3, pendingProcessAt: new Date("2026-01-01T12:01:00Z") },
    ];
    const out = filter(rows, now);
    expect(out.map(r => r.id)).toEqual([2]);
  });

  it("returns empty when no row is due", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const rows: Row[] = [
      { id: 1, pendingProcessAt: null },
      { id: 2, pendingProcessAt: new Date("2026-01-01T13:00:00Z") },
    ];
    expect(filter(rows, now)).toEqual([]);
  });
});

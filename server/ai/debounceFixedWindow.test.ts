import { describe, it, expect } from "vitest";

/**
 * Replica a semântica de `setConversationPendingProcessAt` (db.ts) sem tocar
 * no MySQL. A regra é:
 *   - se `at = null` ou `force = true` → escreve.
 *   - senão, só escreve quando o `pendingProcessAt` atual é nulo OU já vencido.
 *   - se houver um `pendingProcessAt` futuro → preserva (fixed window).
 */
type Row = { pendingProcessAt: Date | null };

function setPending(
  row: Row,
  at: Date | null,
  now: Date,
  opts?: { force?: boolean }
): Row {
  const force = !!opts?.force;
  if (at === null || force) {
    return { pendingProcessAt: at };
  }
  if (row.pendingProcessAt && row.pendingProcessAt > now) {
    return row; // preserva
  }
  return { pendingProcessAt: at };
}

describe("debounce fixed window", () => {
  const now = new Date("2026-01-01T12:00:00Z");

  it("1ª mensagem agenda quando pendingProcessAt é null", () => {
    const row: Row = { pendingProcessAt: null };
    const target = new Date(now.getTime() + 30_000);
    const next = setPending(row, target, now);
    expect(next.pendingProcessAt).toEqual(target);
  });

  it("2ª mensagem NÃO empurra a janela quando ainda há pending futuro", () => {
    const target1 = new Date(now.getTime() + 30_000);
    const row: Row = { pendingProcessAt: target1 };
    const target2 = new Date(now.getTime() + 30_000 + 5_000); // lead digitou 5s depois
    const next = setPending(row, target2, now);
    expect(next.pendingProcessAt).toEqual(target1); // preservou
  });

  it("após o pending ter vencido, nova msg agenda nova janela", () => {
    const past = new Date(now.getTime() - 1_000);
    const row: Row = { pendingProcessAt: past };
    const target = new Date(now.getTime() + 30_000);
    const next = setPending(row, target, now);
    expect(next.pendingProcessAt).toEqual(target);
  });

  it("force: true sobrescreve mesmo com janela em andamento", () => {
    const target1 = new Date(now.getTime() + 30_000);
    const row: Row = { pendingProcessAt: target1 };
    const target2 = new Date(now.getTime() + 60_000);
    const next = setPending(row, target2, now, { force: true });
    expect(next.pendingProcessAt).toEqual(target2);
  });

  it("at=null limpa a janela (após processar o turno)", () => {
    const row: Row = { pendingProcessAt: new Date(now.getTime() + 30_000) };
    const next = setPending(row, null, now);
    expect(next.pendingProcessAt).toBeNull();
  });

  it("3 mensagens em rajada: a janela só é definida pela 1ª", () => {
    let row: Row = { pendingProcessAt: null };
    const t0 = now;
    const target = new Date(t0.getTime() + 30_000);
    row = setPending(row, target, t0);
    expect(row.pendingProcessAt).toEqual(target);

    // 5s depois, lead manda outra mensagem
    const t1 = new Date(t0.getTime() + 5_000);
    const target1 = new Date(t1.getTime() + 30_000);
    row = setPending(row, target1, t1);
    expect(row.pendingProcessAt).toEqual(target);

    // Mais 10s depois (ainda dentro da janela), terceira mensagem
    const t2 = new Date(t0.getTime() + 15_000);
    const target2 = new Date(t2.getTime() + 30_000);
    row = setPending(row, target2, t2);
    expect(row.pendingProcessAt).toEqual(target);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * [Fase 90] Reenvio automático foi DESATIVADO. Estes testes garantem:
 *  1) `startRetryWorker` ainda existe (precisa pra `runRetryWorkerNow` funcionar
 *     no `retryNow`), mas NÃO é chamado no boot do servidor.
 *  2) Reconexão do Baileys NÃO dispara `runRetryWorkerNow`.
 *  3) `runRetryWorkerNow` continua disponível para o reenvio manual via UI.
 */

describe("[Fase 90] DLQ manual-only", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("server boot (_core/index.ts) NÃO chama startRetryWorker", async () => {
    // Carrega o source como string e busca chamadas ativas a startRetryWorker.
    // Aceita comentário (// startRetryWorker(); …) mas rejeita chamada ativa.
    const fs = await import("fs/promises");
    const src = await fs.readFile(
      new URL("../_core/index.ts", import.meta.url),
      "utf-8",
    );
    // Linhas começando com `//` são ignoradas. Procuramos uma chamada ativa.
    const activeCalls = src
      .split(/\r?\n/)
      .filter(l => !l.trim().startsWith("//"))
      .filter(l => /\bstartRetryWorker\s*\(/.test(l));
    expect(activeCalls).toHaveLength(0);
  });

  it("baileys.ts no evento 'connection: open' NÃO chama runRetryWorkerNow", async () => {
    const fs = await import("fs/promises");
    const src = await fs.readFile(
      new URL("./baileys.ts", import.meta.url),
      "utf-8",
    );
    // Confere que TODA ocorrência de `runRetryWorkerNow(` na fonte está em comentário.
    const lines = src.split(/\r?\n/);
    const activeCalls = lines.filter(
      l => /runRetryWorkerNow\s*\(/.test(l) && !l.trim().startsWith("//"),
    );
    // Permitido apenas em routers/etc; baileys.ts em si não pode ter chamada ativa.
    expect(activeCalls).toHaveLength(0);
  });

  it("dispatcher enfileira DLQ com nextRetryAt=null e maxAttempts=1", async () => {
    const fs = await import("fs/promises");
    const src = await fs.readFile(
      new URL("./dispatcher.ts", import.meta.url),
      "utf-8",
    );
    // Confere que TODOS os `enqueueMessageRetry(` no dispatcher passam
    // `nextRetryAt: null` e `maxAttempts: 1` (não usam mais nextRetryAt(1)).
    expect(/nextRetryAt:\s*null/.test(src)).toBe(true);
    expect(/maxAttempts:\s*1/.test(src)).toBe(true);
    // E que NÃO há chamada residual a nextRetryAt(N) dentro do dispatcher.
    expect(/from\s+["']\.\/retryBackoff["']/.test(src)).toBe(false);
  });

  it("baileys.ts enfileira DLQ com nextRetryAt=null e maxAttempts=1", async () => {
    const fs = await import("fs/promises");
    const src = await fs.readFile(
      new URL("./baileys.ts", import.meta.url),
      "utf-8",
    );
    // Procura blocos `enqueueMessageRetry({ ... })` e valida campos.
    const blocks = src.match(/enqueueMessageRetry\s*\(\s*\{[\s\S]*?\}\s*\)/g) ?? [];
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      expect(b).toMatch(/nextRetryAt:\s*null/);
      expect(b).toMatch(/maxAttempts:\s*1/);
    }
  });

  it("retryWorker exporta runRetryWorkerNow (necessário p/ reenvio manual)", async () => {
    const m = await import("./retryWorker");
    expect(typeof m.runRetryWorkerNow).toBe("function");
    expect(typeof m.startRetryWorker).toBe("function");
    expect(typeof m.stopRetryWorker).toBe("function");
  });

  it("UI Retries.tsx mostra mensagem de reenvio manual-only", async () => {
    const fs = await import("fs/promises");
    const src = await fs.readFile(
      new URL("../../client/src/pages/Retries.tsx", import.meta.url),
      "utf-8",
    );
    // Mensagem chave da nova UI (literal):
    expect(src).toContain("não é reenviada sozinha");
    // Não deve mais prometer backoff exponencial automático:
    expect(src).not.toContain("backoff exponencial");
  });
});

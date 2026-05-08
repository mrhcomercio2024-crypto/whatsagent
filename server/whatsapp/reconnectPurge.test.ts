import { describe, it, expect } from "vitest";
import fs from "fs/promises";

/**
 * [Fase 91] Quando o WhatsApp reconectar (Baileys ou Z-API) ou o servidor
 * reiniciar, o agente NÃO deve responder mensagens acumuladas durante o
 * offline. Estes testes inspecionam o source para garantir que os pontos
 * de purga estão presentes e não foram removidos acidentalmente.
 *
 * Razão de auditar via source (não via mock de runtime): a lógica é
 * disparada por callbacks do Baileys/Z-API, que não são fáceis de mockar
 * sem montar um stack inteiro. Os testes garantem o INVARIANTE estrutural.
 */

describe("[Fase 91] Purge pendingProcessAt no reconnect", () => {
  it("baileys.ts em 'connection: open' chama purgePendingProcessForAgent", async () => {
    const src = await fs.readFile(
      new URL("./baileys.ts", import.meta.url),
      "utf-8",
    );
    // Encontra o bloco do listener `connection === "open"` e checa
    // que o purge é referenciado dentro dele.
    const openIdx = src.indexOf('connection === "open"');
    expect(openIdx).toBeGreaterThan(-1);
    const closeIdx = src.indexOf('connection === "close"', openIdx);
    const block = src.slice(openIdx, closeIdx);
    expect(block).toContain("purgePendingProcessForAgent");
    expect(block).toContain("agentId");
  });

  it("zapiWebhook.ts em handleZapiStatus chama purgePendingProcessForAgent na transição offline→online", async () => {
    const src = await fs.readFile(
      new URL("./zapiWebhook.ts", import.meta.url),
      "utf-8",
    );
    const statusIdx = src.indexOf("async function handleZapiStatus");
    expect(statusIdx).toBeGreaterThan(-1);
    const block = src.slice(statusIdx);
    expect(block).toContain("purgePendingProcessForAgent");
    // Garante que SÓ purga quando a instância estava offline antes
    // (transição connected: false -> true). Sem essa guarda, todo
    // status update — inclusive os repetidos durante operação normal
    // — purgaria pendingProcessAt e desativaria a IA.
    expect(block).toContain("wasOffline");
  });

  it("debounceWorker.ts faz purga no boot via purgeStalePendingProcess", async () => {
    const src = await fs.readFile(
      new URL("../ai/debounceWorker.ts", import.meta.url),
      "utf-8",
    );
    expect(src).toContain("purgeStalePendingProcess");
    expect(src).toContain("BOOT_PURGE_GRACE_MS");
    // Tolerância de 60s — não pode ser muito menor (debounce normal
    // de 5–30s ainda precisa pegar) nem muito maior (rajada após restart).
    const m = src.match(/BOOT_PURGE_GRACE_MS\s*=\s*(\d[\d_]*)/);
    expect(m).not.toBeNull();
    const value = parseInt(m![1].replace(/_/g, ""), 10);
    expect(value).toBeGreaterThanOrEqual(30_000);
    expect(value).toBeLessThanOrEqual(120_000);
  });

  it("db.ts exporta purgePendingProcessForAgent e purgeStalePendingProcess", async () => {
    const m = await import("../db");
    expect(typeof m.purgePendingProcessForAgent).toBe("function");
    expect(typeof m.purgeStalePendingProcess).toBe("function");
  });

  it("purgePendingProcessForAgent: assinatura aceita (agentId, cutoff)", async () => {
    const m = await import("../db");
    // Como não temos DB conectado nos testes, apenas checamos que
    // a função existe e aceita 2 argumentos sem throw síncrono.
    const result = await m.purgePendingProcessForAgent(99999, new Date());
    expect(typeof result).toBe("number");
  });

  it("purgeStalePendingProcess: assinatura aceita (cutoff) e retorna number", async () => {
    const m = await import("../db");
    const result = await m.purgeStalePendingProcess(new Date());
    expect(typeof result).toBe("number");
  });

  it("baileys.ts NÃO chama runRetryWorkerNow no 'open' (regra Fase 90 preservada)", async () => {
    const src = await fs.readFile(
      new URL("./baileys.ts", import.meta.url),
      "utf-8",
    );
    const openIdx = src.indexOf('connection === "open"');
    const closeIdx = src.indexOf('connection === "close"', openIdx);
    const block = src.slice(openIdx, closeIdx);
    // Aceita comentário/menção, mas chamada ativa não.
    const lines = block.split(/\r?\n/);
    const activeCalls = lines.filter(
      l => /runRetryWorkerNow\s*\(/.test(l) && !l.trim().startsWith("//") && !l.trim().startsWith("*"),
    );
    expect(activeCalls).toHaveLength(0);
  });
});

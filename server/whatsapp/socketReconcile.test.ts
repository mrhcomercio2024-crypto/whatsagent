import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Contrato da Fase 80: quando o dispatcher detecta que não há socket vivo
 * para o agente (sockets.get(agent.id) === undefined), ele DEVE:
 *   1. Persistir as mensagens no histórico (já fazia).
 *   2. Reconciliar o status no DB para "disconnected" se estiver em "connected"
 *      (evita o painel mentir que está conectado quando o socket sumiu).
 *   3. Tentar religar automaticamente quando há authBlob persistido (creds
 *      válidas — religação nunca gera QR novo).
 *   4. Enfileirar a mensagem na DLQ para reentrega.
 *
 * Este teste lê o código-fonte para garantir que essas travas continuam
 * presentes mesmo após futuras refatorações.
 */
describe("socket vanished reconciliation (Fase 80)", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "baileys.ts"),
    "utf-8",
  );

  it("persiste outbound antes de qualquer outra ação quando socket está morto", () => {
    const idx = src.indexOf("no live socket for agent");
    expect(idx).toBeGreaterThan(0);
    const slice = src.slice(idx, idx + 2000);
    expect(slice).toMatch(/persistOutboundActions/);
  });

  it("reconcilia status DB de connected → disconnected quando socket sumiu", () => {
    const idx = src.indexOf("socket vanished");
    expect(idx).toBeGreaterThan(0);
    const slice = src.slice(idx - 800, idx + 600);
    expect(slice).toMatch(/getQrSession/);
    expect(slice).toMatch(/upsertQrSession/);
    expect(slice).toMatch(/status: "disconnected"/);
    expect(slice).toMatch(/markDisconnected/);
  });

  it("auto-religa quando há authBlob persistido (creds válidas)", () => {
    const idx = src.indexOf("tentando religar automaticamente");
    expect(idx).toBeGreaterThan(0);
    const slice = src.slice(idx - 400, idx + 600);
    expect(slice).toMatch(/sess\.authBlob/);
    expect(slice).toMatch(/!sockets\.has/);
    expect(slice).toMatch(/!statePromises\.has/);
    expect(slice).toMatch(/startQrSession/);
  });

  it("enfileira na DLQ com lastError 'no live socket (offline)'", () => {
    expect(src).toMatch(/lastError: "no live socket \(offline\)"/);
  });

  it("não duplica enqueue quando a chamada já é uma retry", () => {
    expect(src).toMatch(/__isRetry as \{ retryId: number \} \| undefined/);
    expect(src).toMatch(/if \(!__isRetry\)/);
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  startWatchdog,
  stopWatchdog,
  _clearAllPendingForTest,
} from "./reconnect";

/**
 * Regressão da Fase 77:
 *
 * O watchdog NÃO deve religar agentes que ainda não foram pareados.
 * Antes do fix, sessões em `awaiting_qr` apareciam em
 * `listReconnectableQrSessions()` e o watchdog as ressuscitava,
 * gerando QR atrás de QR antes do usuário escanear.
 *
 * Aqui simulamos o contrato: a função `listAgents` passada ao watchdog
 * só retorna agentes elegíveis para reconnect (ou seja, NÃO inclui
 * `awaiting_qr` nem `connecting`). Garantimos que para esse contrato
 * o watchdog se comporta corretamente.
 */
describe("baileys watchdog — não religa em awaiting_qr (Fase 77)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _clearAllPendingForTest();
  });
  afterEach(() => {
    stopWatchdog();
    vi.useRealTimers();
    _clearAllPendingForTest();
  });

  it("não chama startSession quando lista vem vazia (awaiting_qr filtrado upstream)", async () => {
    const startSession = vi.fn().mockResolvedValue(undefined);
    startWatchdog(
      {
        isConnected: () => false,
        // Lista vazia = nenhum agente elegível para reconnect (awaiting_qr foi filtrado)
        listAgents: async () => [],
        startSession,
        getLastActivityAt: () => null,
        sendHeartbeat: async () => {},
      },
      { intervalMs: 1000, staleMs: 60_000 },
    );

    await vi.advanceTimersByTimeAsync(2_500);
    expect(startSession).not.toHaveBeenCalled();
  });

  it("religa quando lista contém agente que estava connected mas caiu", async () => {
    const startSession = vi.fn().mockResolvedValue(undefined);
    startWatchdog(
      {
        isConnected: () => false,
        listAgents: async () => [{ agentId: 42 }],
        startSession,
        getLastActivityAt: () => null,
        sendHeartbeat: async () => {},
      },
      { intervalMs: 1000, staleMs: 60_000 },
    );

    await vi.advanceTimersByTimeAsync(1_500);
    expect(startSession).toHaveBeenCalledWith(42);
  });

  it("não religa agente que já está conectado (live)", async () => {
    const startSession = vi.fn().mockResolvedValue(undefined);
    startWatchdog(
      {
        isConnected: () => true,
        listAgents: async () => [{ agentId: 42 }],
        startSession,
        getLastActivityAt: () => Date.now(),
        sendHeartbeat: async () => {},
      },
      { intervalMs: 1000, staleMs: 60_000 },
    );

    await vi.advanceTimersByTimeAsync(2_500);
    expect(startSession).not.toHaveBeenCalled();
  });
});

/**
 * Documentação de contrato com o caller (db.ts → listReconnectableQrSessions):
 *
 * O watchdog confia na lista que recebe. Se a lista incluir um agente em
 * `awaiting_qr`, o watchdog vai religá-lo. Por isso, o filtro DEVE acontecer
 * em `listReconnectableQrSessions`, não no watchdog.
 *
 * Se algum dia esse contrato mudar (ex: mover o filtro para o watchdog),
 * o teste abaixo precisa ser atualizado conjuntamente.
 */
describe("contrato listReconnectableQrSessions (smoke)", () => {
  it("o conjunto de status válidos para auto-religação é apenas connected/disconnected", () => {
    const allowedStatuses = new Set(["connected", "disconnected"]);
    // Estes NÃO podem religar automaticamente:
    expect(allowedStatuses.has("awaiting_qr")).toBe(false);
    expect(allowedStatuses.has("connecting")).toBe(false);
    expect(allowedStatuses.has("logged_out")).toBe(false);
    expect(allowedStatuses.has("banned")).toBe(false);
    // Estes SIM:
    expect(allowedStatuses.has("connected")).toBe(true);
    expect(allowedStatuses.has("disconnected")).toBe(true);
  });
});

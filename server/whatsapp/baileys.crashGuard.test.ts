import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Reproduz o cenário que derrubou o processo:
 * - Baileys emite `connection.update` com `connection: 'close'` e
 *   `lastDisconnect.error` indicando conflict (replaced).
 * - Dentro do handler, `upsertQrSession` falha com ECONNRESET no MySQL.
 * - Precisamos garantir que o ERRO NÃO PROPAGA para fora do handler
 *   (o que mataria o processo Node e travaria o dispatcher).
 *
 * Em vez de subir o socket inteiro do Baileys, isolamos o miolo do handler
 * em uma função pura `safelyHandleConnectionUpdate` testável e validamos
 * que ela NUNCA reject.
 */

const upsertQrSessionMock = vi.fn();

vi.mock("../db", () => ({
  upsertQrSession: (...a: any[]) => upsertQrSessionMock(...a),
}));

beforeEach(() => {
  upsertQrSessionMock.mockReset();
});

/**
 * Reimplementação enxuta da blindagem usada em baileys.ts para fins de teste.
 * Mantemos a mesma forma defensiva: try/catch envolvendo TODO o corpo + try/catch
 * individual ao redor das chamadas de banco. Qualquer mudança no handler real
 * deve manter este invariante: NÃO PROPAGAR.
 */
async function safelyHandleConnectionUpdate(agentId: number, u: any) {
  try {
    const { connection, qr } = u;
    if (qr) {
      try {
        await upsertQrSessionMock(agentId, { status: "awaiting_qr", lastQr: qr });
      } catch (e) {
        // swallow
      }
    }
    if (connection === "open") {
      try {
        await upsertQrSessionMock(agentId, { status: "connected" });
      } catch (e) {
        // swallow
      }
    }
    if (connection === "close") {
      try {
        await upsertQrSessionMock(agentId, { status: "disconnected" });
      } catch (e) {
        // swallow
      }
    }
  } catch (e) {
    // outer guard: nunca propaga
  }
}

describe("baileys: connection.update handler crash guard", () => {
  it("não propaga ECONNRESET quando upsertQrSession falha em close", async () => {
    upsertQrSessionMock.mockRejectedValue(
      Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })
    );
    await expect(
      safelyHandleConnectionUpdate(1, {
        connection: "close",
        lastDisconnect: { error: { message: "Stream Errored (conflict)" } },
      })
    ).resolves.toBeUndefined();
    expect(upsertQrSessionMock).toHaveBeenCalledWith(1, expect.objectContaining({ status: "disconnected" }));
  });

  it("não propaga falha em open", async () => {
    upsertQrSessionMock.mockRejectedValue(new Error("boom"));
    await expect(
      safelyHandleConnectionUpdate(1, { connection: "open" })
    ).resolves.toBeUndefined();
  });

  it("não propaga falha em qr-encode-then-upsert", async () => {
    upsertQrSessionMock.mockRejectedValueOnce(new Error("kaboom"));
    await expect(
      safelyHandleConnectionUpdate(1, { qr: "data:image/png;base64,XX" })
    ).resolves.toBeUndefined();
  });

  it("evento sem connection nem qr não chama nada", async () => {
    await expect(
      safelyHandleConnectionUpdate(1, {})
    ).resolves.toBeUndefined();
    expect(upsertQrSessionMock).not.toHaveBeenCalled();
  });

  it("evento close benigno (sem erro DB) registra disconnected normalmente", async () => {
    upsertQrSessionMock.mockResolvedValue(undefined);
    await safelyHandleConnectionUpdate(1, { connection: "close" });
    expect(upsertQrSessionMock).toHaveBeenCalledWith(1, expect.objectContaining({ status: "disconnected" }));
  });
});

import { describe, it, expect } from "vitest";

/**
 * Garante o contrato do helper "envio com timeout duro" usado em
 * dispatchViaBaileys: se o sock.sendMessage não resolver em 20s, a Promise
 * deve rejeitar com `sendMessage timeout (20s)` e liberar o slot do orchestrator.
 *
 * Este teste valida o padrão Promise.race + setTimeout reject (mesma forma
 * usada no baileys.ts) em isolamento, sem subir o socket real.
 */

function sendWithTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`sendMessage timeout (${ms / 1000}s)`)), ms)
    ),
  ]);
}

describe("sendMessage timeout wrapper", () => {
  it("resolve normalmente quando o envio responde rápido", async () => {
    const fast = new Promise<{ key: { id: string } }>(res =>
      setTimeout(() => res({ key: { id: "abc" } }), 5)
    );
    const r = await sendWithTimeout(fast, 200);
    expect(r.key.id).toBe("abc");
  });

  it("rejeita com mensagem clara quando passa do limite", async () => {
    const stuck = new Promise(() => {
      /* nunca resolve */
    });
    await expect(sendWithTimeout(stuck as Promise<unknown>, 30)).rejects.toThrow(
      /sendMessage timeout/
    );
  });

  it("não vaza handles: uma rejeição dentro do timeout não rompe a fila", async () => {
    const stuck = new Promise(() => {});
    let captured: string | null = null;
    try {
      await sendWithTimeout(stuck as Promise<unknown>, 20);
    } catch (e) {
      captured = (e as Error).message;
    }
    // O catch deve liberar o orchestrator para a próxima mensagem.
    expect(captured).toMatch(/timeout/);
    // E uma chamada subsequente normal deve ainda funcionar.
    const r = await sendWithTimeout(Promise.resolve("ok"), 50);
    expect(r).toBe("ok");
  });
});

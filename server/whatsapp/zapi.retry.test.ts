import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendText, sendVideo } from "./zapi";

const creds = { instanceId: "inst", token: "tok" };

describe("zapi client — retry interno em erros transitórios", () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
    vi.useFakeTimers();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  async function runWithFakeFetch(impl: typeof fetch, runner: () => Promise<any>) {
    global.fetch = impl as any;
    const promise = runner();
    // Avança todos os setTimeout (backoff) sem esperar tempo real
    await vi.runAllTimersAsync();
    return promise;
  }

  it("sucesso na 1ª tentativa não dispara retries", async () => {
    let calls = 0;
    const impl = vi.fn(async () => {
      calls++;
      return new Response(JSON.stringify({ messageId: "m1" }), { status: 200 });
    });
    const r = await runWithFakeFetch(impl as any, () =>
      sendText(creds, "5511999", "oi"),
    );
    expect(r.ok).toBe(true);
    expect(r.messageId).toBe("m1");
    expect(calls).toBe(1);
  });

  it("retenta 'fetch failed' até 4 vezes e desiste se persistir", async () => {
    let calls = 0;
    const impl = vi.fn(async () => {
      calls++;
      throw new TypeError("fetch failed");
    });
    const r = await runWithFakeFetch(impl as any, () =>
      sendText(creds, "5511999", "oi"),
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/fetch failed/i);
    expect(calls).toBe(4); // 1 inicial + 3 retries
  });

  it("retenta 'fetch failed' e succeede na 2ª tentativa", async () => {
    let calls = 0;
    const impl = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new TypeError("fetch failed");
      return new Response(JSON.stringify({ messageId: "ok" }), { status: 200 });
    });
    const r = await runWithFakeFetch(impl as any, () =>
      sendText(creds, "5511999", "oi"),
    );
    expect(r.ok).toBe(true);
    expect(r.messageId).toBe("ok");
    expect(calls).toBe(2);
  });

  it("HTTP 503 é considerado transitório e dispara retry", async () => {
    let calls = 0;
    const impl = vi.fn(async () => {
      calls++;
      if (calls < 3) {
        return new Response(JSON.stringify({ message: "service unavailable" }), {
          status: 503,
        });
      }
      return new Response(JSON.stringify({ messageId: "ok" }), { status: 200 });
    });
    const r = await runWithFakeFetch(impl as any, () =>
      sendText(creds, "5511999", "oi"),
    );
    expect(r.ok).toBe(true);
    expect(calls).toBe(3);
  });

  it("HTTP 401 NÃO retenta (erro permanente do cliente)", async () => {
    let calls = 0;
    const impl = vi.fn(async () => {
      calls++;
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
      });
    });
    const r = await runWithFakeFetch(impl as any, () =>
      sendText(creds, "5511999", "oi"),
    );
    expect(r.ok).toBe(false);
    expect(calls).toBe(1);
  });

  it("HTTP 400 com payload inválido NÃO retenta", async () => {
    let calls = 0;
    const impl = vi.fn(async () => {
      calls++;
      return new Response(
        JSON.stringify({ error: "Base64/Url could not be read" }),
        { status: 400 },
      );
    });
    const r = await runWithFakeFetch(impl as any, () =>
      sendVideo(creds, "5511999", "https://ex.com/v.mp4"),
    );
    expect(r.ok).toBe(false);
    expect(calls).toBe(1);
    expect(r.error).toMatch(/Base64/);
  });

  it("ECONNRESET é considerado transitório", async () => {
    let calls = 0;
    const impl = vi.fn(async () => {
      calls++;
      const e = new Error("read ECONNRESET");
      throw e;
    });
    const r = await runWithFakeFetch(impl as any, () =>
      sendText(creds, "5511999", "oi"),
    );
    expect(r.ok).toBe(false);
    expect(calls).toBe(4);
  });

  it("aborta requisição após timeout (mídia: 90s)", async () => {
    // Simula fetch que respeita signal.abort()
    const impl = vi.fn(async (_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal!.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    });
    const promise = (async () => {
      global.fetch = impl as any;
      return sendVideo(creds, "5511999", "https://ex.com/v.mp4");
    })();
    // Avança 91s para passar do timeout de mídia
    await vi.advanceTimersByTimeAsync(91_000);
    // Avança backoffs entre tentativas
    await vi.runAllTimersAsync();
    const r = await promise;
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/abort/i);
    // 4 tentativas totais
    expect(impl).toHaveBeenCalledTimes(4);
  });
});

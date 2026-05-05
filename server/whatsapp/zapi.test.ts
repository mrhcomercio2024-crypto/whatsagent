import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendText, sendImage, sendDocument, getStatus } from "./zapi";

const creds = { instanceId: "INST", token: "TKN", clientToken: "CT" };

const originalFetch = globalThis.fetch;

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const ok = init.ok ?? true;
  const status = init.status ?? (ok ? 200 : 500);
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  }) as any;
}

describe("zapi client", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sendText: chama POST /send-text com headers Client-Token e payload {phone, message}", async () => {
    mockFetchOnce({ messageId: "WAID-1", id: "WAID-1" });
    const r = await sendText(creds, "+55 11 99999-1111", "olá");
    expect(r.ok).toBe(true);
    expect(r.messageId).toBe("WAID-1");
    const call = (globalThis.fetch as any).mock.calls[0];
    const url = String(call[0]);
    const init = call[1] ?? {};
    expect(url).toContain("/instances/INST/token/TKN/send-text");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.phone).toMatch(/^\+?\d/);
    expect(body.message).toBe("olá");
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Client-Token"]).toBe("CT");
  });

  it("sendImage: usa /send-image com {phone, image, caption}", async () => {
    mockFetchOnce({ messageId: "IMG-1" });
    const r = await sendImage(creds, "+5511999992222", "https://x/image.jpg", "legenda");
    expect(r.ok).toBe(true);
    const call = (globalThis.fetch as any).mock.calls[0];
    expect(String(call[0])).toContain("/send-image");
    const body = JSON.parse(call[1].body);
    expect(body.image).toBe("https://x/image.jpg");
    expect(body.caption).toBe("legenda");
  });

  it("sendDocument: usa /send-document/{ext} e envia {phone, document, fileName}", async () => {
    mockFetchOnce({ messageId: "DOC-1" });
    const r = await sendDocument(creds, "+5511999993333", "https://x/file.pdf", "file.pdf");
    expect(r.ok).toBe(true);
    const call = (globalThis.fetch as any).mock.calls[0];
    expect(String(call[0])).toContain("/send-document/pdf");
    const body = JSON.parse(call[1].body);
    expect(body.document).toBe("https://x/file.pdf");
    expect(body.fileName).toBe("file.pdf");
  });

  it("getStatus: chama GET /status e retorna campo connected", async () => {
    mockFetchOnce({ connected: true, session: true, smartphoneConnected: true });
    const r = await getStatus(creds);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.connected).toBe(true);
      expect(r.data.session).toBe(true);
    }
    const call = (globalThis.fetch as any).mock.calls[0];
    expect(String(call[0])).toContain("/instances/INST/token/TKN/status");
    expect(call[1].method ?? "GET").toMatch(/GET/i);
  });

  it("erro de rede / status não-ok devolve ok:false com mensagem após esgotar retries", async () => {
    vi.useFakeTimers();
    try {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNRESET")) as any;
      const promise = sendText(creds, "+5511999994444", "boom");
      // Dispara todos os setTimeout de backoff sem esperar tempo real
      await vi.runAllTimersAsync();
      const r = await promise;
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/ECONNRESET|fetch|network/i);
      // ECONNRESET é transitório: 4 tentativas (1 + 3 retries)
      expect((globalThis.fetch as any).mock.calls.length).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });
});

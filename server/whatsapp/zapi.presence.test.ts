/**
 * Testes do helper sendPresence (typing indicator Z-API).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendPresence } from "./zapi";

describe("sendPresence (Z-API typing indicator)", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
  afterEach(() => fetchSpy.mockRestore());

  it("chama o endpoint correto com status composing", async () => {
    const res = await sendPresence(
      { instanceId: "INST", token: "TOK", clientToken: "CT" },
      "5511999999999",
      "composing",
    );
    expect(res.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/instances/INST/token/TOK/send-message-presence");
    expect((init.headers as any)["Client-Token"]).toBe("CT");
    const body = JSON.parse(init.body as string);
    expect(body.phone).toBe("5511999999999");
    expect(body.status).toBe("composing");
    expect(body.delay).toBeUndefined();
  });

  it("inclui delay quando passado", async () => {
    await sendPresence(
      { instanceId: "I", token: "T" },
      "5511988887777",
      "recording",
      3000,
    );
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.status).toBe("recording");
    expect(body.delay).toBe(3000);
  });

  it("normaliza phone (remove sufixo @c.us e não-dígitos)", async () => {
    await sendPresence(
      { instanceId: "I", token: "T" },
      "+55 (11) 99999-9999@c.us",
      "composing",
    );
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.phone).toBe("5511999999999");
  });

  it("retorna ok=false quando faltam credenciais", async () => {
    const res = await sendPresence(
      { instanceId: "", token: "" },
      "5511999999999",
      "composing",
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/n\u00e3o configurada/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("propaga erro HTTP da Z-API", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Instance not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const res = await sendPresence(
      { instanceId: "I", token: "T" },
      "5511999999999",
      "composing",
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Instance not found");
  });
});

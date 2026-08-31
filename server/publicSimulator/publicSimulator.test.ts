import { describe, expect, it } from "vitest";
import {
  buildTrackedCheckoutUrl,
  decodeAudioBase64,
  extractContactFacts,
  matchesCheckoutRequest,
  normalizePhoneCandidate,
  safeRequestId,
} from "./service";
import {
  generatePublicCredentials,
  hashPublicToken,
  verifyPublicToken,
} from "./db";
import {
  extractPaymentIdentifiers,
  mapPaymentEvent,
  pickPaymentEvent,
} from "./webhook";

describe("public simulator session security", () => {
  it("stores/verifies only the token hash", () => {
    const { publicId, token } = generatePublicCredentials();
    const hash = hashPublicToken(token);
    expect(publicId).toHaveLength(32);
    expect(token.length).toBeGreaterThan(30);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
    expect(verifyPublicToken(token, hash)).toBe(true);
    expect(verifyPublicToken(`${token}x`, hash)).toBe(false);
  });

  it("sanitizes idempotency request ids", () => {
    expect(safeRequestId("abc<script>:123")).toBe("abcscript:123");
    expect(safeRequestId("a".repeat(200))).toHaveLength(80);
  });
});

describe("public simulator lead facts", () => {
  it("extracts email and Brazilian WhatsApp", () => {
    expect(
      extractContactFacts("Meu contato é (11) 99876-5432 e email Teste@Email.com"),
    ).toEqual({ phone: "+5511998765432", email: "teste@email.com" });
  });

  it("extracts a self-declared name without inventing one", () => {
    expect(extractContactFacts("Meu nome é joão da silva").name).toBe("João Da Silva");
    expect(extractContactFacts("Quero saber o preço").name).toBeUndefined();
  });

  it("normalizes local and international numbers", () => {
    expect(normalizePhoneCandidate("11987654321")).toBe("+5511987654321");
    expect(normalizePhoneCandidate("+55 11 98765-4321")).toBe("+5511987654321");
    expect(normalizePhoneCandidate("123")).toBeNull();
  });
});

describe("public simulator audio", () => {
  it("decodes a valid data URL", () => {
    const source = Buffer.from("audio-test");
    expect(decodeAudioBase64(`data:audio/webm;base64,${source.toString("base64")}`)).toEqual(source);
  });

  it("rejects empty audio", () => {
    expect(() => decodeAudioBase64("")).toThrow("Áudio vazio");
  });
});

describe("checkout intent and tracking", () => {
  it("matches configured checkout requests accent-insensitively", () => {
    const patterns = ["como faço para comprar", "quero o link"];
    expect(matchesCheckoutRequest("Como faco para comprar?", patterns)).toBe(true);
    expect(matchesCheckoutRequest("Ainda estou pensando", patterns)).toBe(false);
  });

  it("adds source and session tracking without overwriting existing UTMs", () => {
    const tracked = new URL(
      buildTrackedCheckoutUrl("https://checkout.example.com/p/1?utm_source=meta", "session123"),
    );
    expect(tracked.searchParams.get("utm_source")).toBe("meta");
    expect(tracked.searchParams.get("utm_medium")).toBe("conversa_ravi");
    expect(tracked.searchParams.get("wa_sim_session")).toBe("session123");
  });
});

describe("Looma/Pagar.me webhook mapping", () => {
  it.each([
    ["order.paid", "purchase_paid"],
    ["invoice.paid", "purchase_paid"],
    ["charge.payment_failed", "purchase_failed"],
    ["charge.refunded", "purchase_refunded"],
    ["order.created", null],
  ])("maps %s to %s", (event, expected) => {
    expect(mapPaymentEvent(event)).toBe(expected);
  });

  it("recognizes the Pagar.me V5 envelope", () => {
    const payload = {
      id: "hook_evt_123",
      type: "order.paid",
      data: {
        id: "or_fallback",
        code: "ORDER-2026-01",
        amount: 12990,
        currency: "BRL",
        customer: {
          email: "comprador@example.com",
          phones: { mobile_phone: { country_code: "55", area_code: "11", number: "998765432" } },
        },
        metadata: { wa_sim_session: "public-session-1" },
      },
    };
    expect(pickPaymentEvent(payload)).toBe("order.paid");
    const ids = extractPaymentIdentifiers(payload);
    expect(ids.eventId).toBe("hook_evt_123");
    expect(ids.orderId).toBe("ORDER-2026-01");
    expect(ids.email).toBe("comprador@example.com");
    expect(ids.publicId).toBe("public-session-1");
    expect(ids.amountCents).toBe(12990);
  });

  it("does not classify unknown events as purchases", () => {
    expect(pickPaymentEvent({ event: "subscription.created" })).toBe("subscription.created");
    expect(mapPaymentEvent("subscription.created")).toBeNull();
  });
});

describe("public/private route boundaries", () => {
  it("keeps the visitor route public and the editor in the authenticated layout", async () => {
    const fs = await import("node:fs/promises");
    const [app, admin, router] = await Promise.all([
      fs.readFile(new URL("../../client/src/App.tsx", import.meta.url), "utf8"),
      fs.readFile(new URL("../../client/src/pages/PublicSimulatorAdmin.tsx", import.meta.url), "utf8"),
      fs.readFile(new URL("./router.ts", import.meta.url), "utf8"),
    ]);
    expect(app).toContain('path="/simulador/:slug"');
    expect(app).toContain('path="/simulador-whatsapp"');
    expect(admin).toContain("<AppLayout>");
    expect(router).toContain("bootstrap: publicProcedure");
    expect(router).toContain("getConfig: adminProcedure");
  });

  it("uses the real orchestrator in simulation mode and never dispatches Z-API", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(new URL("./service.ts", import.meta.url), "utf8");
    expect(source).toContain("processInboundForReply({");
    expect(source).toContain("isSimulation: true");
    expect(source).not.toContain("dispatchActions(");
    expect(source).not.toContain("sendTextZapi");
  });
});

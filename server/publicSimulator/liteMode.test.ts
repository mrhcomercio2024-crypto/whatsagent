import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { isRaviWebLite, normalizeRaviWebMode } from "../../shared/raviWebMode";
import { mapHistory } from "../../client/src/pages/PublicSimulatorChat";

const CONFIG = {
  slug: "ravi",
  mode: "lite" as const,
  displayName: "Ravi Wedrop",
  statusText: "online",
  avatarUrl: null,
  accentColor: "#00a884",
  welcomeMessage: "Olá",
  startButtonText: "SIM, QUERO SABER",
  startLeadMessage: "Sim, quero saber como funciona.",
  inputPlaceholder: "Digite uma mensagem",
  checkoutButtonText: "ABRIR CHECKOUT",
};

describe("Ravi Web Lite feature flag", () => {
  it("defaults unknown values to Lite and only enables Advanced explicitly", () => {
    expect(normalizeRaviWebMode(undefined)).toBe("lite");
    expect(normalizeRaviWebMode("lite")).toBe("lite");
    expect(normalizeRaviWebMode("advanced")).toBe("advanced");
    expect(isRaviWebLite("lite")).toBe(true);
    expect(isRaviWebLite("advanced")).toBe(false);
  });

  it("uses an additive default-Lite migration and preserves advanced columns", async () => {
    const [schema, migration] = await Promise.all([
      readFile(new URL("../../drizzle/schema.ts", import.meta.url), "utf8"),
      readFile(new URL("../../drizzle/0031_lowly_mikhail_rasputin.sql", import.meta.url), "utf8"),
    ]);
    expect(schema).toContain('webMode: mysqlEnum("webMode", ["lite", "advanced"])');
    expect(schema).toContain('pushEnabled: boolean("pushEnabled")');
    expect(migration).toContain("ADD `webMode` enum('lite','advanced') DEFAULT 'lite' NOT NULL");
    expect(migration).not.toMatch(/DROP|DELETE|TRUNCATE/i);
  });

  it("keeps Push and recovery code preserved but unreachable in Lite", async () => {
    const [router, service, chat] = await Promise.all([
      readFile(new URL("./router.ts", import.meta.url), "utf8"),
      readFile(new URL("./service.ts", import.meta.url), "utf8"),
      readFile(new URL("../../client/src/pages/PublicSimulatorChat.tsx", import.meta.url), "utf8"),
    ]);
    expect(router).toContain('const advanced = mode === "advanced"');
    expect(router).toContain("enabled: advanced && config.pushEnabled");
    expect(service).toContain('if (!liteMode) await cancelPendingRecoveryJobs(session.id, "lead_replied")');
    expect(service).toContain("if (!liteMode && activeSubscription");
    expect(chat).toContain('config?.mode === "advanced"');
    expect(chat).toContain('config.mode === "lite" || recoveredOnMountRef.current');
    expect(chat).toContain("recoverRequest(pending, retryOriginal)");
  });
});

describe("Ravi Web Lite transport and retry", () => {
  it("has one finite synchronous timeout and a manual retry with the same requestId", async () => {
    const chat = await readFile(
      new URL("../../client/src/pages/PublicSimulatorChat.tsx", import.meta.url),
      "utf8",
    );
    expect(chat).toContain("const LITE_REQUEST_TIMEOUT_MS = 45_000");
    expect(chat).toContain("await withTimeout(sendOriginal(), LITE_REQUEST_TIMEOUT_MS)");
    expect(chat).toContain("Não consegui responder agora. Tentar novamente?");
    expect(chat).toContain("liteRetryActionRef.current = runLiteRequest");
    expect(chat).toContain("const sendOriginal = () => sendText.mutateAsync({ slug, ...credentials, requestId");
    expect(chat).toContain("sendLockRef.current");
    expect(chat).toContain("liteRetryAvailable || sendLockRef.current");
    expect(chat).toContain('config?.mode === "advanced" &&');
    expect(chat).toContain('const reloadKey = "ravi:lite-sw-cleared"');
    expect(chat.match(/window\.location\.reload\(\)/g)).toHaveLength(1);
  });

  it("unregisters Ravi Service Workers and deletes only Ravi/PWA caches", async () => {
    const webPush = await readFile(
      new URL("../../client/src/lib/webPush.ts", import.meta.url),
      "utf8",
    );
    expect(webPush).toContain("registration.unregister()");
    expect(webPush).toContain('/ravi|whatsagent|simulator|pwa/i.test(key)');
    expect(webPush).toContain('link[rel="manifest"]');
    expect(webPush).not.toContain("localStorage.clear");
  });
});

describe("Ravi Web Lite 30-turn history stress", () => {
  it("maps 30 complete turns in order with stable unique keys and no loss", () => {
    const base = Date.UTC(2026, 7, 31, 12, 0, 0);
    const messages = Array.from({ length: 30 }, (_, turn) => [
      {
        id: turn * 2 + 1,
        conversationId: 150100,
        direction: "inbound",
        contentType: "text",
        body: `Mensagem do lead ${turn + 1}`,
        createdAt: new Date(base + turn * 2_000).toISOString(),
        metadata: { publicSimulator: true },
      },
      {
        id: turn * 2 + 2,
        conversationId: 150100,
        direction: "outbound",
        contentType: "text",
        body: `Resposta do Ravi ${turn + 1}`,
        createdAt: new Date(base + turn * 2_000 + 1_000).toISOString(),
        metadata: { publicSimulator: true },
      },
    ]).flat();

    const mapped = mapHistory(messages, CONFIG);
    expect(mapped).toHaveLength(60);
    expect(new Set(mapped.map(item => item.id)).size).toBe(60);
    expect(mapped.filter(item => item.side === "lead")).toHaveLength(30);
    expect(mapped.filter(item => item.side === "agent")).toHaveLength(30);
    expect(mapped[0]?.text).toBe("Mensagem do lead 1");
    expect(mapped[59]?.text).toBe("Resposta do Ravi 30");
    expect(mapHistory(messages, CONFIG).map(item => item.id)).toEqual(mapped.map(item => item.id));
    const halfSize = JSON.stringify(mapHistory(messages.slice(0, 30), CONFIG)).length;
    const fullSize = JSON.stringify(mapped).length;
    expect(fullSize).toBeGreaterThan(halfSize);
    expect(fullSize).toBeLessThan(halfSize * 2.2);
  });
});

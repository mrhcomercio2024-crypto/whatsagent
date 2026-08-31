import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PUBLIC_REQUEST_EXPIRY_MS,
  publicRequestRecoveryDelay,
  statusForAbsentPublicRequest,
} from "../../shared/publicRequestRecovery";

const root = resolve(import.meta.dirname, "../..");
const chatSource = readFileSync(resolve(root, "client/src/pages/PublicSimulatorChat.tsx"), "utf8");
const routerSource = readFileSync(resolve(root, "server/publicSimulator/router.ts"), "utf8");
const dbSource = readFileSync(resolve(root, "server/publicSimulator/db.ts"), "utf8");
const serviceSource = readFileSync(resolve(root, "server/publicSimulator/service.ts"), "utf8");
const debugSource = readFileSync(resolve(root, "client/src/components/ViewportDebugPanel.tsx"), "utf8");
const schemaSource = readFileSync(resolve(root, "drizzle/schema.ts"), "utf8");

describe("public request recovery state machine", () => {
  it("treats a recently absent request as processing, never as terminal not_found", () => {
    const now = 1_800_000;
    expect(statusForAbsentPublicRequest(now - 1, now)).toBe("processing");
    expect(statusForAbsentPublicRequest(now - 60_000, now)).toBe("processing");
    expect(routerSource).not.toContain('status: "missing"');
    expect(chatSource).not.toContain('new Error("Resposta não encontrada")');
  });

  it("expires only after the configured ten-minute certainty window", () => {
    const now = 2_000_000;
    expect(statusForAbsentPublicRequest(now - PUBLIC_REQUEST_EXPIRY_MS + 1, now)).toBe("processing");
    expect(statusForAbsentPublicRequest(now - PUBLIC_REQUEST_EXPIRY_MS, now)).toBe("expired");
  });

  it("uses the requested limited 2s, 3s, 5s and 8s backoff", () => {
    expect([0, 1, 2, 3, 4, 99].map(publicRequestRecoveryDelay)).toEqual([
      2_000,
      3_000,
      5_000,
      8_000,
      8_000,
      8_000,
    ]);
  });

  it("persists the request before the inbound message and before invoking Ravi", () => {
    const begin = serviceSource.indexOf("await beginPublicRequest(");
    const inbound = serviceSource.indexOf("await appendMessage(", begin);
    const invoke = serviceSource.indexOf("await processInboundForReply(", begin);
    expect(begin).toBeGreaterThan(-1);
    expect(inbound).toBeGreaterThan(begin);
    expect(invoke).toBeGreaterThan(inbound);
  });

  it("scopes create, complete, fail and recovery by sessionId plus requestId", () => {
    expect(schemaSource).toContain("pub_sim_req_session_request_unique");
    expect(dbSource.match(/eq\(publicSimulatorRequests\.sessionId, sessionId\)/g)?.length).toBeGreaterThanOrEqual(5);
    expect(dbSource.match(/eq\(publicSimulatorRequests\.requestId, requestId\)/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it("stores requestId before sending and retries the same original operation at most once", () => {
    const save = chatSource.indexOf("savePendingRequest(slug, pending)");
    const send = chatSource.indexOf("sendOriginal()", save);
    expect(save).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(save);
    expect(chatSource).toContain("!retriedOriginal");
    expect(chatSource).toContain("retriedOriginal = true");
    expect(chatSource).toContain("recoverRequest(pending, sendOriginal)");
  });

  it("exposes only explicit terminal/processing states and the full debug payload", () => {
    expect(routerSource).toContain('status: absentStatus');
    expect(routerSource).toContain('request.status === "expired"');
    for (const field of [
      "requestId",
      "requestStatus",
      "conversationId",
      "lastHTTPStatus",
      "recoveryAttempts",
      "lastRecoveryResult",
      "frontendError",
    ]) {
      expect(debugSource).toContain(field);
      expect(chatSource).toContain(field);
    }
  });

  it("does not clear or replace session credentials when recovery transport fails", () => {
    const recoverStart = chatSource.indexOf("const recoverRequest");
    const recoverEnd = chatSource.indexOf("const processTextNow", recoverStart);
    const recoverBody = chatSource.slice(recoverStart, recoverEnd);
    expect(recoverBody).not.toContain("localStorage.removeItem(sessionStorageKey");
    expect(recoverBody).not.toContain("setCredentials(null)");
    expect(recoverBody).not.toContain("bootstrap.mutateAsync");
  });
});

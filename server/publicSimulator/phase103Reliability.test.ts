import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const chat = fs.readFileSync(path.join(root, "client/src/pages/PublicSimulatorChat.tsx"), "utf8");
const router = fs.readFileSync(path.join(root, "server/publicSimulator/router.ts"), "utf8");
const service = fs.readFileSync(path.join(root, "server/publicSimulator/service.ts"), "utf8");
const main = fs.readFileSync(path.join(root, "client/src/main.tsx"), "utf8");
const debugPanel = fs.readFileSync(path.join(root, "client/src/components/ViewportDebugPanel.tsx"), "utf8");

describe("Fase 103 — confiabilidade do Ravi Web no iPhone", () => {
  it("usa fluxo natural e não volta a controlar o viewport por JavaScript", () => {
    expect(chat).toContain('className="ravi-page w-full min-h-[100svh]');
    expect(chat).toContain("position: sticky");
    expect(chat).toContain("overflow: visible");
    expect(chat).not.toContain("visualViewport");
    expect(chat).not.toContain("window.innerHeight");
    expect(chat).not.toContain('className="mx-auto flex h-[100svh]');
    expect(chat).not.toContain("overflow-hidden");
  });

  it("mantém textarea nativo em 16px e scrollIntoView tardio restrito ao campo", () => {
    expect(chat).toContain('text-[16px]');
    expect(chat).toContain('block: "nearest"');
    expect(chat).toContain("}, 180)");
    expect(chat).toContain("Math.min(112, event.currentTarget.scrollHeight)");
  });

  it("limita debounce e digitação em toda resposta pública persistida", () => {
    expect(service).toContain("debounceSeconds: Math.min(agent.debounceSeconds, 2)");
    expect(service).toContain("typingCps: Math.max(agent.typingCps, 16)");
    expect(service).toContain("typingMaxDelayMs: Math.min(agent.typingMaxDelayMs, 3500)");
    expect(service).toContain("interMessageDelayMs: Math.min(agent.interMessageDelayMs, 850)");
  });

  it("persiste requestId e recupera resposta concluída sem duplicar balões", () => {
    expect(chat).toContain("pendingRequestStorageKey");
    expect(chat).toContain("savePendingRequest(slug, pending)");
    expect(chat).toContain("requestStatus.fetch");
    expect(chat).toContain("alreadyVisible");
    expect(chat).toContain("MAX_REVEAL_TIME_MS = 15_000");
    expect(chat).toMatch(/finally\s*\{[\s\S]*setPhase\("idle"\)/);
    expect(router).toContain("requestStatus: publicProcedure");
    expect(router).toContain("recoverPublicRequestForSession");
  });

  it("não reinicia a página silenciosamente quando um chunk falha", () => {
    expect(main).not.toContain("window.location.reload();");
    expect(main).toContain("Seu histórico continua salvo");
    expect(main).toContain("Continuar conversa");
  });

  it("expõe telemetria somente com debugViewport=1", () => {
    expect(debugPanel).toContain('get("debugViewport") === "1"');
    expect(debugPanel).toContain("innerHeight");
    expect(debugPanel).toContain("documentClientHeight");
    expect(debugPanel).toContain("textareaScrollHeight");
    expect(debugPanel).toContain("[Ravi viewport]");
  });
});

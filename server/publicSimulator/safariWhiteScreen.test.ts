import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const chatSource = fs.readFileSync(
  path.join(root, "client/src/pages/PublicSimulatorChat.tsx"),
  "utf8",
);
const swSource = fs.readFileSync(path.join(root, "client/public/sw.js"), "utf8");
const mainSource = fs.readFileSync(path.join(root, "client/src/main.tsx"), "utf8");
const htmlSource = fs.readFileSync(path.join(root, "client/index.html"), "utf8");
const appSource = fs.readFileSync(path.join(root, "client/src/App.tsx"), "utf8");

describe("Ravi Web — proteção contra tela branca no Safari", () => {
  it("não possui hook, listener ou controle manual do viewport", () => {
    expect(fs.existsSync(path.join(root, "client/src/hooks/useChatVisualViewport.ts"))).toBe(false);
    expect(chatSource).not.toContain("visualViewport");
    expect(chatSource).not.toContain("ravi:viewport-resize");
  });

  it("usa fluxo natural com sticky sem fullscreen fixo ou altura calculada por JavaScript", () => {
    expect(chatSource).toContain("min-h-[100svh]");
    expect(chatSource).toContain("position: sticky");
    expect(chatSource).toContain("overflow: visible");
    expect(chatSource).not.toContain("fixed inset-0");
    expect(chatSource).not.toContain("100dvh");
  });

  it("não intercepta scroll nem força foco após o envio", () => {
    expect(chatSource).not.toContain("window.scrollTo(0, 0)");
    expect(chatSource).not.toContain('inputRef.current?.focus({ preventScroll: true })');
  });

  it("Service Worker nunca devolve navegação indefinida", () => {
    expect(swSource).toContain('const RAVI_CACHE = "ravi-pwa-v2"');
    expect(swSource).toContain("if (cached) return cached");
    expect(swSource).toContain("new Response(");
    expect(swSource).toContain("Reconectando sua conversa");
  });

  it("mantém shell escuro antes do React montar", () => {
    expect(htmlSource).toContain("html, body, #root");
    expect(htmlSource).toContain("background: #071015");
    expect(htmlSource).toContain("Abrindo sua conversa…");
  });

  it("mostra recuperação de chunk sem recarregar silenciosamente", () => {
    expect(mainSource).toContain('window.addEventListener("vite:preloadError"');
    expect(mainSource).toContain('const key = "ravi:asset-recovery"');
    expect(mainSource).not.toContain("window.location.reload();");
    expect(mainSource).toContain("Seu histórico continua salvo");
    expect(mainSource).toContain("Continuar conversa");
  });

  it("possui Error Boundary específico sem perder o histórico", () => {
    expect(appSource).toContain("PublicSimulatorErrorBoundary");
    expect(appSource).toContain("<PublicSimulatorChat />");
  });

  it("carrega mídia sob demanda para reduzir memória", () => {
    expect(chatSource).toContain('preload="metadata"');
  });
});

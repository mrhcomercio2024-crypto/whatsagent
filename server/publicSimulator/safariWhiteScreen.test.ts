import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const viewportSource = fs.readFileSync(
  path.join(root, "client/src/hooks/useChatVisualViewport.ts"),
  "utf8",
);
const chatSource = fs.readFileSync(
  path.join(root, "client/src/pages/PublicSimulatorChat.tsx"),
  "utf8",
);
const swSource = fs.readFileSync(path.join(root, "client/public/sw.js"), "utf8");
const mainSource = fs.readFileSync(path.join(root, "client/src/main.tsx"), "utf8");
const htmlSource = fs.readFileSync(path.join(root, "client/index.html"), "utf8");
const appSource = fs.readFileSync(path.join(root, "client/src/App.tsx"), "utf8");

describe("Ravi Web — proteção contra tela branca no Safari", () => {
  it("não escuta visualViewport.scroll nem fixa o body", () => {
    expect(viewportSource).not.toContain('viewport?.addEventListener("scroll"');
    expect(viewportSource).not.toContain('body.style.position = "fixed"');
  });

  it("limita a altura e nunca aplica offsetTop do Safari ao chat", () => {
    expect(viewportSource).toContain("Math.max(240");
    expect(viewportSource).toContain('setProperty("--ravi-visual-top", "0px")');
    expect(chatSource).toContain("top: 0;");
    expect(chatSource).toContain("min-height: 240px;");
  });

  it("não executa auto-scroll duplo em cada resize", () => {
    expect(chatSource).not.toContain('window.setTimeout(() => scrollToLatest("auto"), 120)');
    expect(chatSource).toContain("document.activeElement === inputRef.current");
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

  it("recupera falhas de chunk uma única vez", () => {
    expect(mainSource).toContain('window.addEventListener("vite:preloadError"');
    expect(mainSource).toContain('const key = "ravi:asset-recovery"');
    expect(mainSource).toContain("window.location.reload()");
  });

  it("possui Error Boundary específico sem perder o histórico", () => {
    expect(appSource).toContain("PublicSimulatorErrorBoundary");
    expect(appSource).toContain("<PublicSimulatorChat />");
  });

  it("carrega mídia sob demanda para reduzir memória", () => {
    expect(chatSource).toContain('preload="metadata"');
  });
});

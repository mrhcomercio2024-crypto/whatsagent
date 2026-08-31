import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const chat = fs.readFileSync(path.join(root, "client/src/pages/PublicSimulatorChat.tsx"), "utf8");
const html = fs.readFileSync(path.join(root, "client/index.html"), "utf8");
const hookPath = path.join(root, "client/src/hooks/useChatVisualViewport.ts");

describe("Ravi mobile keyboard viewport", () => {
  it("remove completamente o hook e qualquer manipulação de VisualViewport", () => {
    expect(fs.existsSync(hookPath)).toBe(false);
    expect(chat).not.toContain("useChatVisualViewport");
    expect(chat).not.toContain("visualViewport");
    expect(chat).not.toContain("--ravi-visual-height");
  });

  it("usa documento nativo, sem fullscreen fixo, body lock ou altura dinâmica", () => {
    expect(chat).toContain('className="ravi-page w-full min-h-[100svh]');
    expect(chat).not.toContain("fixed inset-0");
    expect(chat).not.toContain("height: 100dvh");
    expect(chat).not.toContain("window.scrollTo(0, 0)");
  });

  it("mantém header e compositor sticky com mensagens no fluxo natural", () => {
    expect(chat).toContain("ravi-shell flex min-h-[100svh]");
    expect(chat).toContain("position: sticky");
    expect(chat).toContain("ravi-messages sim-chat-bg w-full flex-1 overflow-visible");
    expect(chat).toContain("overflow: visible");
    expect(chat).toContain('ref={messagesRef}');
    expect(chat).toContain("env(safe-area-inset-bottom)");
    expect(chat).toContain("env(safe-area-inset-top)");
  });

  it("impede zoom do input no iPhone sem desativar o zoom do usuário", () => {
    expect(chat).toContain("text-[16px]");
    expect(html).toContain("viewport-fit=cover");
    expect(html).not.toContain("interactive-widget");
    expect(html).not.toContain("maximum-scale=1");
    expect(html).not.toContain("user-scalable=no");
  });

  it("não refoca nem controla a página depois do envio", () => {
    expect(chat).not.toContain('window.addEventListener("ravi:viewport-resize"');
    expect(chat).not.toContain('inputRef.current?.focus({ preventScroll: true })');
    expect(chat).toContain('scrollIntoView({ block: "nearest", behavior: "smooth" })');
    expect(chat).toContain('onPointerDown={event => event.preventDefault()}');
  });
});

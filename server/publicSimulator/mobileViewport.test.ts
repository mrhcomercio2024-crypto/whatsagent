import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const hook = fs.readFileSync(path.join(root, "client/src/hooks/useChatVisualViewport.ts"), "utf8");
const chat = fs.readFileSync(path.join(root, "client/src/pages/PublicSimulatorChat.tsx"), "utf8");
const html = fs.readFileSync(path.join(root, "client/index.html"), "utf8");

describe("Ravi mobile keyboard viewport", () => {
  it("tracks visual viewport height and offset during keyboard resize", () => {
    expect(hook).toContain("window.visualViewport");
    expect(hook).toContain('viewport?.addEventListener("resize", sync)');
    expect(hook).toContain('viewport?.addEventListener("scroll", sync)');
    expect(hook).toContain('--ravi-visual-height');
    expect(hook).toContain('--ravi-visual-top');
  });

  it("locks and restores document scrolling only while chat is mounted", () => {
    expect(hook).toContain('body.style.position = "fixed"');
    expect(hook).toContain('body.style.overflow = "hidden"');
    expect(hook).toContain("restoreStyle(root, previousRoot)");
    expect(hook).toContain("restoreStyle(body, previousBody)");
  });

  it("uses independent message scrolling and keeps the composer inside safe areas", () => {
    expect(chat).toContain('ref={messagesRef}');
    expect(chat).toContain('className="ravi-composer');
    expect(chat).toContain("env(safe-area-inset-bottom)");
    expect(chat).toContain("env(safe-area-inset-top)");
    expect(chat).toContain("-webkit-overflow-scrolling: touch");
  });

  it("prevents iPhone input zoom without disabling user zoom", () => {
    expect(chat).toContain("text-[16px]");
    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain("interactive-widget=resizes-content");
    expect(html).not.toContain("maximum-scale=1");
    expect(html).not.toContain("user-scalable=no");
  });

  it("keeps focus and scrolls to the latest message as the keyboard opens", () => {
    expect(chat).toContain('window.addEventListener("ravi:viewport-resize"');
    expect(chat).toContain('onFocus={() =>');
    expect(chat).toContain('focus({ preventScroll: true })');
    expect(chat).toContain('messages.scrollTo({ top: messages.scrollHeight');
  });
});

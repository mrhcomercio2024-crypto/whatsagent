import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const hook = fs.readFileSync(path.join(root, "client/src/hooks/useChatVisualViewport.ts"), "utf8");
const chat = fs.readFileSync(path.join(root, "client/src/pages/PublicSimulatorChat.tsx"), "utf8");
const html = fs.readFileSync(path.join(root, "client/index.html"), "utf8");

describe("Ravi mobile keyboard viewport", () => {
  it("lets Safari manage the visual viewport without resizing the app in JavaScript", () => {
    expect(hook).not.toContain("window.visualViewport");
    expect(hook).not.toContain("--ravi-visual-height");
    expect(hook).not.toContain("--ravi-visual-top");
    expect(chat).toContain('className="ravi-app-shell fixed inset-0');
    expect(chat).toContain("height: 100dvh");
  });

  it("locks overflow without fixing the iOS body and restores styles on unmount", () => {
    expect(hook).not.toContain('body.style.position = "fixed"');
    expect(hook).toContain('body.style.overflow = "hidden"');
    expect(hook).toContain("restore(root, previousRoot)");
    expect(hook).toContain("restore(body, previousBody)");
    expect(hook).toContain('window.addEventListener("scroll", keepDocumentAtOrigin');
    expect(hook).toContain("window.scrollTo(0, 0)");
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

  it("keeps focus and scrolls to the latest message without viewport event loops", () => {
    expect(chat).not.toContain('window.addEventListener("ravi:viewport-resize"');
    expect(chat).toContain('onFocus={() =>');
    expect(chat).toContain('focus({ preventScroll: true })');
    expect(chat).toContain('messages.scrollTo({ top: messages.scrollHeight');
  });
});

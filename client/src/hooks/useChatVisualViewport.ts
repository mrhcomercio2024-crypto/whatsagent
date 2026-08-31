import { useLayoutEffect, useState } from "react";

const KEYBOARD_THRESHOLD_PX = 140;

function rememberStyle(element: HTMLElement) {
  return {
    overflow: element.style.overflow,
    overscrollBehavior: element.style.overscrollBehavior,
    position: element.style.position,
    inset: element.style.inset,
    width: element.style.width,
  };
}

function restoreStyle(element: HTMLElement, previous: ReturnType<typeof rememberStyle>) {
  element.style.overflow = previous.overflow;
  element.style.overscrollBehavior = previous.overscrollBehavior;
  element.style.position = previous.position;
  element.style.inset = previous.inset;
  element.style.width = previous.width;
}

export function useChatVisualViewport() {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const previousRoot = rememberStyle(root);
    const previousBody = rememberStyle(body);
    const viewport = window.visualViewport;
    let largestHeight = Math.max(window.innerHeight, viewport?.height || 0);
    let frame = 0;

    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    body.style.position = "fixed";
    body.style.inset = "0";
    body.style.width = "100%";

    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const height = Math.round(viewport?.height || window.innerHeight);
        const top = Math.round(viewport?.offsetTop || 0);
        largestHeight = Math.max(largestHeight, window.innerHeight, height);
        const nextKeyboardOpen = largestHeight - height > KEYBOARD_THRESHOLD_PX;
        root.style.setProperty("--ravi-visual-height", `${height}px`);
        root.style.setProperty("--ravi-visual-top", `${top}px`);
        root.dataset.raviKeyboard = nextKeyboardOpen ? "open" : "closed";
        setKeyboardOpen(nextKeyboardOpen);
        window.dispatchEvent(new CustomEvent("ravi:viewport-resize", { detail: { height, top, keyboardOpen: nextKeyboardOpen } }));
      });
    };

    sync();
    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);

    return () => {
      window.cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      root.style.removeProperty("--ravi-visual-height");
      root.style.removeProperty("--ravi-visual-top");
      delete root.dataset.raviKeyboard;
      restoreStyle(root, previousRoot);
      restoreStyle(body, previousBody);
    };
  }, []);

  return keyboardOpen;
}

import { useLayoutEffect, useRef, useState } from "react";

const KEYBOARD_THRESHOLD_PX = 140;

function rememberStyle(element: HTMLElement) {
  return {
    overflow: element.style.overflow,
    overscrollBehavior: element.style.overscrollBehavior,
    position: element.style.position,
    inset: element.style.inset,
    width: element.style.width,
    backgroundColor: element.style.backgroundColor,
  };
}

function restoreStyle(element: HTMLElement, previous: ReturnType<typeof rememberStyle>) {
  element.style.overflow = previous.overflow;
  element.style.overscrollBehavior = previous.overscrollBehavior;
  element.style.position = previous.position;
  element.style.inset = previous.inset;
  element.style.width = previous.width;
  element.style.backgroundColor = previous.backgroundColor;
}

export function useChatVisualViewport() {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const keyboardOpenRef = useRef(false);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const previousRoot = rememberStyle(root);
    const previousBody = rememberStyle(body);
    const viewport = window.visualViewport;
    let largestHeight = Math.max(window.innerHeight || 0, viewport?.height || 0, 320);
    let frame = 0;
    let timer = 0;
    let lastHeight = 0;

    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    // Não fixe o body no iOS. A combinação body:fixed + visualViewport.scroll
    // cria um ciclo de relayout no WebKit e pode derrubar a camada de render.
    body.style.width = "100%";
    root.style.backgroundColor = "#071015";
    body.style.backgroundColor = "#071015";

    const commit = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const rawHeight = Number(viewport?.height || window.innerHeight || largestHeight);
        const height = Number.isFinite(rawHeight)
          ? Math.max(240, Math.min(Math.round(rawHeight), Math.max(largestHeight, 240)))
          : largestHeight;
        largestHeight = Math.max(largestHeight, window.innerHeight || 0, height);
        const nextKeyboardOpen = largestHeight - height > KEYBOARD_THRESHOLD_PX;
        if (Math.abs(height - lastHeight) < 2 && nextKeyboardOpen === keyboardOpenRef.current) return;
        lastHeight = height;
        root.style.setProperty("--ravi-visual-height", `${height}px`);
        // offsetTop oscila com a barra do Safari; aplicar esse valor ao root
        // pode deslocar toda a conversa para fora da tela.
        root.style.setProperty("--ravi-visual-top", "0px");
        root.dataset.raviKeyboard = nextKeyboardOpen ? "open" : "closed";
        if (nextKeyboardOpen !== keyboardOpenRef.current) {
          keyboardOpenRef.current = nextKeyboardOpen;
          setKeyboardOpen(nextKeyboardOpen);
        }
        window.dispatchEvent(new CustomEvent("ravi:viewport-resize", { detail: { height, top: 0, keyboardOpen: nextKeyboardOpen } }));
      });
    };

    const sync = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(commit, 80);
    };

    commit();
    viewport?.addEventListener("resize", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    window.addEventListener("pageshow", sync);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      viewport?.removeEventListener("resize", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      window.removeEventListener("pageshow", sync);
      root.style.removeProperty("--ravi-visual-height");
      root.style.removeProperty("--ravi-visual-top");
      delete root.dataset.raviKeyboard;
      restoreStyle(root, previousRoot);
      restoreStyle(body, previousBody);
    };
  }, []);

  return keyboardOpen;
}

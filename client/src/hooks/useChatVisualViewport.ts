import { useLayoutEffect, useState } from "react";

type SavedStyles = {
  overflow: string;
  overscrollBehavior: string;
  width: string;
  backgroundColor: string;
};

function remember(element: HTMLElement): SavedStyles {
  return {
    overflow: element.style.overflow,
    overscrollBehavior: element.style.overscrollBehavior,
    width: element.style.width,
    backgroundColor: element.style.backgroundColor,
  };
}

function restore(element: HTMLElement, saved: SavedStyles) {
  element.style.overflow = saved.overflow;
  element.style.overscrollBehavior = saved.overscrollBehavior;
  element.style.width = saved.width;
  element.style.backgroundColor = saved.backgroundColor;
}

function isTextInput(target: EventTarget | null) {
  return target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && !["button", "submit", "checkbox", "radio"].includes(target.type));
}

/**
 * O Safari iOS já move o visual viewport para manter o campo focado acima do
 * teclado. Alterar a altura/top do app com visualViewport ao mesmo tempo cria
 * uma segunda compensação e produz o grande vazio visto no iPhone.
 *
 * Este hook só bloqueia o scroll do documento e acompanha o foco. O shell do
 * chat permanece sempre estável em 100dvh; apenas a lista interna de mensagens
 * rola, como em um app de conversa nativo.
 */
export function useChatVisualViewport() {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const previousRoot = remember(root);
    const previousBody = remember(body);
    let blurTimer = 0;

    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    root.style.backgroundColor = "#071015";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    body.style.width = "100%";
    body.style.backgroundColor = "#071015";

    const handleFocusIn = (event: FocusEvent) => {
      window.clearTimeout(blurTimer);
      if (isTextInput(event.target)) setKeyboardOpen(true);
    };

    const handleFocusOut = () => {
      window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(() => {
        setKeyboardOpen(isTextInput(document.activeElement));
      }, 120);
    };

    const keepDocumentAtOrigin = () => {
      // O Safari tenta rolar o layout viewport para revelar o textarea, mesmo
      // quando o teclado já deixou o campo visível. Repor a origem impede que
      // o shell inteiro suba; a lista de mensagens continua rolando sozinha.
      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    window.addEventListener("scroll", keepDocumentAtOrigin, { passive: true });

    return () => {
      window.clearTimeout(blurTimer);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      window.removeEventListener("scroll", keepDocumentAtOrigin);
      restore(root, previousRoot);
      restore(body, previousBody);
    };
  }, []);

  return keyboardOpen;
}

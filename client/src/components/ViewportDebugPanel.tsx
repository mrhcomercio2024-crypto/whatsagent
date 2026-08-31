import { useEffect, useMemo, useState } from "react";

type Snapshot = {
  innerHeight: number;
  documentClientHeight: number;
  scrollY: number;
  page: string;
  messages: string;
  composer: string;
  activeElement: string;
  textareaHeight: number;
  textareaScrollHeight: number;
};

function rect(selector: string) {
  const value = document.querySelector(selector)?.getBoundingClientRect();
  if (!value) return "—";
  return `${Math.round(value.top)}..${Math.round(value.bottom)} (${Math.round(value.height)}px)`;
}

function capture(): Snapshot {
  const textarea = document.querySelector<HTMLTextAreaElement>(".ravi-composer textarea");
  const active = document.activeElement;
  return {
    innerHeight: Math.round(window.innerHeight),
    documentClientHeight: Math.round(document.documentElement.clientHeight),
    scrollY: Math.round(window.scrollY),
    page: rect(".ravi-page"),
    messages: rect(".ravi-messages"),
    composer: rect(".ravi-composer"),
    activeElement: active ? `${active.tagName.toLowerCase()}${active === textarea ? ".composer" : ""}` : "—",
    textareaHeight: Math.round(textarea?.getBoundingClientRect().height || 0),
    textareaScrollHeight: Math.round(textarea?.scrollHeight || 0),
  };
}

type RequestSnapshot = {
  sessionId?: number | null;
  requestId: string | null;
  requestStatus: string;
  conversationId: number | null;
  lastHTTPStatus: number | null;
  lastResponseMs?: number | null;
  recoveryAttempts: number;
  lastRecoveryResult: string | null;
  frontendError: string | null;
};

export default function ViewportDebugPanel({ request, lite = false }: { request: RequestSnapshot; lite?: boolean }) {
  const viewportEnabled = useMemo(
    () => new URLSearchParams(window.location.search).get("debugViewport") === "1",
    [],
  );
  const liteEnabled = useMemo(() => {
    const query = new URLSearchParams(window.location.search);
    return query.get("debug") === "1" || query.get("debugViewport") === "1";
  }, []);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (lite || !viewportEnabled) return;
    const update = () => {
      const next = capture();
      setSnapshot(next);
      console.info("[Ravi viewport]", next);
    };
    update();
    const timer = window.setInterval(update, 750);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, [lite, viewportEnabled]);

  if (lite) {
    if (!liteEnabled) return null;
    return (
      <pre className="fixed left-2 top-2 z-[9999] max-w-[calc(100vw-1rem)] overflow-auto rounded-lg border border-emerald-400/40 bg-black/90 p-2 text-[10px] leading-4 text-emerald-200 shadow-2xl">
        {JSON.stringify({
          sessionId: request.sessionId ?? null,
          conversationId: request.conversationId,
          lastHTTPStatus: request.lastHTTPStatus,
          lastResponseMs: request.lastResponseMs ?? null,
          lastError: request.frontendError,
        }, null, 2)}
      </pre>
    );
  }

  if (!viewportEnabled || !snapshot) return null;
  return (
    <pre className="fixed left-2 top-2 z-[9999] max-w-[calc(100vw-1rem)] overflow-auto rounded-lg border border-emerald-400/40 bg-black/90 p-2 text-[10px] leading-4 text-emerald-200 shadow-2xl">
      {JSON.stringify({ ...snapshot, ...request }, null, 2)}
    </pre>
  );
}

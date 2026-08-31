import { trpc } from "@/lib/trpc";
import {
  calculateHumanInterMessageDelay,
  calculateHumanPreparationDelay,
  calculateHumanTypingDelay,
} from "@shared/humanTyping";
import {
  BellRing,
  CheckCheck,
  Download,
  FileText,
  Loader2,
  Mic,
  Paperclip,
  Pause,
  Play,
  Send,
  Share2,
  Smile,
  Square,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRoute } from "wouter";
import { useChatVisualViewport } from "../hooks/useChatVisualViewport";
import {
  getPushCapability,
  registerRaviServiceWorker,
  subscribeBrowserToPush,
} from "../lib/webPush";

type PublicConfig = {
  slug: string;
  displayName: string;
  statusText: string;
  avatarUrl: string | null;
  accentColor: string;
  welcomeMessage: string;
  startButtonText: string;
  startLeadMessage: string;
  inputPlaceholder: string;
  checkoutButtonText: string;
  push?: {
    enabled: boolean;
    consentEnabled: boolean;
    minInteractions: number;
    interestScoreThreshold: number;
    strongInterestScore: number;
    consentMessage: string;
    consentButtonText: string;
  };
};

type Timing = {
  debounceSeconds: number;
  typingSimulationEnabled: boolean;
  typingCps: number;
  typingMinDelayMs: number;
  typingMaxDelayMs: number;
  interMessageDelayMs: number;
};

type ChatItem = {
  id: string;
  side: "lead" | "agent";
  kind: "text" | "image" | "video" | "audio" | "document" | "checkout";
  text?: string | null;
  mediaUrl?: string | null;
  filename?: string | null;
  checkoutUrl?: string | null;
  checkoutButtonText?: string | null;
  durationMs?: number | null;
  ts: number;
};

type StoredSession = { publicId: string; token: string };

const DEFAULT_TIMING: Timing = {
  debounceSeconds: 8,
  typingSimulationEnabled: true,
  typingCps: 22,
  typingMinDelayMs: 800,
  typingMaxDelayMs: 8000,
  interMessageDelayMs: 1200,
};

function sleep(ms: number) {
  return new Promise<void>(resolve => window.setTimeout(resolve, ms));
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sessionStorageKey(slug: string) {
  return `whatsagent:public-simulator:${slug}`;
}

function readStoredSession(slug: string): StoredSession | undefined {
  try {
    const raw = localStorage.getItem(sessionStorageKey(slug));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as StoredSession;
    return parsed.publicId && parsed.token ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function messageUrl(body: string | null | undefined) {
  return body?.match(/https?:\/\/[^\s]+/i)?.[0] ?? null;
}

function mapHistory(messages: any[], config: PublicConfig): ChatItem[] {
  return messages.map(message => {
    const metadata = (message.metadata || {}) as Record<string, unknown>;
    const ts = message.createdAt ? new Date(message.createdAt).getTime() : Date.now();
    const side = message.direction === "inbound" ? "lead" : "agent";
    if (metadata.checkout) {
      const url = messageUrl(message.body);
      return {
        id: `history-${message.id}`,
        side,
        kind: "checkout",
        text: String(message.body || "").replace(url || "", "").trim(),
        checkoutUrl: url,
        checkoutButtonText: config.checkoutButtonText,
        ts,
      };
    }
    const kind = ["image", "video", "audio", "document"].includes(message.contentType)
      ? message.contentType
      : "text";
    return {
      id: `history-${message.id}`,
      side,
      kind,
      text:
        kind === "audio" && metadata.transcript
          ? String(metadata.transcript)
          : message.body,
      mediaUrl: message.mediaUrl,
      durationMs: Number(metadata.durationMs || 0) || null,
      ts,
    } as ChatItem;
  });
}

function visitorMetadata() {
  const params = new URLSearchParams(window.location.search);
  return {
    utmSource: params.get("utm_source"),
    utmMedium: params.get("utm_medium"),
    utmCampaign: params.get("utm_campaign"),
    utmContent: params.get("utm_content"),
    utmTerm: params.get("utm_term"),
    gclid: params.get("gclid"),
    fbclid: params.get("fbclid"),
    referrer: document.referrer || null,
    landingUrl: window.location.href,
    pushId: params.get("push_id"),
  };
}

export default function PublicSimulatorChat() {
  const [, params] = useRoute("/simulador/:slug");
  const slug = (params?.slug || "ravi").toLowerCase();
  const bootstrap = trpc.publicSimulator.bootstrap.useMutation();
  const sendText = trpc.publicSimulator.sendText.useMutation();
  const sendAudio = trpc.publicSimulator.sendAudio.useMutation();
  const checkoutClicked = trpc.publicSimulator.checkoutClicked.useMutation();
  const pushSubscribe = trpc.publicSimulator.pushSubscribe.useMutation();
  const pushConsentOffered = trpc.publicSimulator.pushConsentOffered.useMutation();
  const pushConsentDeclined = trpc.publicSimulator.pushConsentDeclined.useMutation();
  const presence = trpc.publicSimulator.presence.useMutation();

  const [credentials, setCredentials] = useState<StoredSession | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [timing, setTiming] = useState<Timing>(DEFAULT_TIMING);
  const [status, setStatus] = useState("waiting");
  const [items, setItems] = useState<ChatItem[]>([]);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"idle" | "waiting" | "thinking" | "typing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [pushPrompt, setPushPrompt] = useState<{
    eligible: boolean;
    strongInterest: boolean;
    score: number;
    signals: Array<{ code: string; label: string; points: number }>;
  } | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const keyboardOpen = useChatVisualViewport();

  const mountedRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const queueRef = useRef<string[]>([]);
  const debounceRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedRef = useRef(0);
  const recordingTimerRef = useRef<number | null>(null);

  const busy = phase === "thinking" || phase === "typing";
  const started = status !== "waiting";
  const pushSupport = trpc.publicSimulator.pushSupport.useQuery(
    credentials || { publicId: "invalid-public-session", token: "invalid-public-session-token" },
    { enabled: Boolean(credentials), refetchOnWindowFocus: false },
  );
  const pushCapability = useMemo(
    () => (typeof window === "undefined" ? null : getPushCapability()),
    [],
  );
  const consentEligible = Boolean(pushPrompt?.eligible || pushSupport.data?.consentEligible);
  const strongInterest = Boolean(pushPrompt?.strongInterest || pushSupport.data?.strongInterest);
  const mayOfferPush = Boolean(
    config?.push?.enabled &&
      config.push.consentEnabled &&
      pushSupport.data?.enabled &&
      pushSupport.data?.vapidPublicKey &&
      !pushSupport.data?.subscriptionActive &&
      !pushSupport.data?.consentDeclinedAt &&
      !pushSupport.data?.optedOutAt &&
      consentEligible &&
      pushCapability &&
      (pushCapability.ios ? strongInterest : pushCapability.supported),
  );

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    window.requestAnimationFrame(() => {
      const messages = messagesRef.current;
      if (messages) messages.scrollTo({ top: messages.scrollHeight, behavior });
      endRef.current?.scrollIntoView({ behavior, block: "end" });
    });
  }, []);

  useEffect(() => {
    document.title = "Conversa com RAVI";
    sessionStorage.removeItem("ravi:asset-recovery");
    if (mountedRef.current) return;
    mountedRef.current = true;
    bootstrap
      .mutateAsync({
        slug,
        existing: readStoredSession(slug),
        metadata: visitorMetadata(),
      })
      .then(result => {
        if (!result.config) throw new Error("Simulador indisponível");
        const nextCredentials = { publicId: result.publicId, token: result.token };
        localStorage.setItem(sessionStorageKey(slug), JSON.stringify(nextCredentials));
        setCredentials(nextCredentials);
        setConfig(result.config as PublicConfig);
        setTiming((result.timing || DEFAULT_TIMING) as Timing);
        setStatus(result.status);
        setItems(mapHistory(result.messages as any[], result.config as PublicConfig));
        setPushEnabled(Boolean((result.config as PublicConfig)?.push?.enabled));
        if ((result.config as PublicConfig)?.push?.enabled) {
          void registerRaviServiceWorker().catch(() => undefined);
        }
      })
      .catch(err => setError(err?.message || "Não foi possível abrir a conversa."));
  }, [slug]);

  useEffect(() => {
    if (!credentials || !pushEnabled) return;
    const ping = () => {
      if (document.visibilityState === "visible") {
        void presence.mutateAsync(credentials).catch(() => undefined);
      }
    };
    ping();
    const timer = window.setInterval(ping, 45_000);
    document.addEventListener("visibilitychange", ping);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [credentials, presence, pushEnabled]);

  useEffect(() => {
    if (!mayOfferPush || !credentials || pushSupport.data?.consentOfferedAt) return;
    void pushConsentOffered.mutateAsync(credentials).catch(() => undefined);
  }, [credentials, mayOfferPush, pushConsentOffered, pushSupport.data?.consentOfferedAt]);

  useEffect(() => {
    scrollToLatest("smooth");
  }, [items.length, phase, scrollToLatest]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearInterval(debounceRef.current);
      if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
      recorderRef.current?.stream.getTracks().forEach(track => track.stop());
    };
  }, []);

  const pushItem = useCallback((item: Omit<ChatItem, "id" | "ts"> & { ts?: number }) => {
    setItems(previous => [
      ...previous,
      { id: crypto.randomUUID(), ts: item.ts ?? Date.now(), ...item },
    ]);
  }, []);

  const revealActions = useCallback(
    async (result: any) => {
      const nextTiming = (result.timing || timing) as Timing;
      setTiming(nextTiming);
      for (let index = 0; index < result.actions.length; index += 1) {
        const action = result.actions[index];
        const content = String(action.text || action.caption || action.filename || "mídia");
        setPhase("typing");
        await sleep(calculateHumanPreparationDelay(index));
        await sleep(
          action.kind === "text" || action.kind === "checkout"
            ? calculateHumanTypingDelay(content, nextTiming)
            : Math.max(850, Math.min(1800, calculateHumanTypingDelay(content, nextTiming))),
        );
        if (action.kind === "text") {
          pushItem({ side: "agent", kind: "text", text: action.text });
        } else if (action.kind === "checkout") {
          pushItem({
            side: "agent",
            kind: "checkout",
            text: action.text,
            checkoutUrl: action.url,
            checkoutButtonText: action.buttonText,
          });
        } else {
          pushItem({
            side: "agent",
            kind: action.mediaType,
            text: action.caption,
            mediaUrl: action.mediaUrl,
            filename: action.filename,
          });
        }
        if (index < result.actions.length - 1) {
          setPhase("idle");
          await sleep(calculateHumanInterMessageDelay(nextTiming.interMessageDelayMs));
        }
      }
      setPhase("idle");
    },
    [pushItem, timing],
  );

  const processTextNow = useCallback(
    async (content: string, kind: "start" | "text" = "text") => {
      if (!credentials || !config) return;
      setPhase("thinking");
      try {
        const result = await sendText.mutateAsync({
          slug,
          ...credentials,
          requestId: crypto.randomUUID(),
          kind,
          text: content,
        });
        setStatus("active");
        if (result.pushConsent) setPushPrompt(result.pushConsent);
        await revealActions(result);
      } catch (err: any) {
        setError(err?.message || "Não foi possível enviar. Tente novamente.");
        setPhase("idle");
      }
    },
    [config, credentials, revealActions, sendText, slug],
  );

  const startConversation = async () => {
    if (!config || !credentials || started || busy) return;
    pushItem({ side: "lead", kind: "text", text: config.startLeadMessage });
    setStatus("active");
    await processTextNow(config.startLeadMessage, "start");
  };

  const flushQueue = useCallback(async () => {
    if (debounceRef.current) window.clearInterval(debounceRef.current);
    debounceRef.current = null;
    const merged = queueRef.current.join("\n").trim();
    queueRef.current = [];
    if (merged) await processTextNow(merged, "text");
    else setPhase("idle");
  }, [processTextNow]);

  const queueText = () => {
    const value = text.trim();
    if (!value || !started || busy || recording) return;
    pushItem({ side: "lead", kind: "text", text: value });
    queueRef.current.push(value);
    setText("");
    if (inputRef.current) inputRef.current.style.height = "32px";
    window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    if (debounceRef.current !== null) return;
    let left = Math.max(0, timing.debounceSeconds);
    if (left === 0) {
      void flushQueue();
      return;
    }
    setPhase("waiting");
    debounceRef.current = window.setInterval(() => {
      left -= 1;
      if (left <= 0) void flushQueue();
    }, 1000);
  };

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const cancelRecording = () => {
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state === "recording") recorder.stop();
      recorder.stream.getTracks().forEach(track => track.stop());
    }
    chunksRef.current = [];
    setRecording(false);
    setRecordingMs(0);
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
  };

  const beginRecording = async () => {
    if (!started || busy || phase === "waiting" || recording) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"].find(
        type => MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recordingStartedRef.current = Date.now();
      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
        const durationMs = Date.now() - recordingStartedRef.current;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        setRecording(false);
        setRecordingMs(0);
        if (!blob.size || !credentials || !config) return;
        if (blob.size > 16 * 1024 * 1024) {
          setError("O áudio deve ter no máximo 16 MB.");
          return;
        }
        const localUrl = URL.createObjectURL(blob);
        pushItem({ side: "lead", kind: "audio", mediaUrl: localUrl, durationMs });
        setPhase("thinking");
        try {
          const base64 = await blobToBase64(blob);
          const result = await sendAudio.mutateAsync({
            slug,
            ...credentials,
            requestId: crypto.randomUUID(),
            audioBase64: base64,
            mimeType: blob.type.split(";")[0] || "audio/webm",
            durationMs,
          });
          if (result.pushConsent) setPushPrompt(result.pushConsent);
          await revealActions(result);
        } catch (err: any) {
          setError(err?.message || "Não foi possível entender o áudio.");
          setPhase("idle");
        }
      };
      recorder.start(250);
      setRecording(true);
      recordingTimerRef.current = window.setInterval(
        () => setRecordingMs(Date.now() - recordingStartedRef.current),
        250,
      );
    } catch {
      setError("Permita o acesso ao microfone para enviar áudio.");
    }
  };

  const openCheckout = async (url: string) => {
    if (!credentials) return;
    window.open(url, "_blank", "noopener,noreferrer");
    try {
      await checkoutClicked.mutateAsync(credentials);
    } catch {
      // O checkout já abriu; tracking não pode bloquear a compra.
    }
  };

  const enablePush = async () => {
    if (!credentials || !pushSupport.data?.vapidPublicKey || !pushCapability) return;
    if (pushCapability.ios && !pushCapability.standalone) {
      setShowIosInstructions(true);
      return;
    }
    setPushBusy(true);
    setError(null);
    try {
      const result = await subscribeBrowserToPush(pushSupport.data.vapidPublicKey);
      await pushSubscribe.mutateAsync({ ...credentials, subscription: result.payload });
      setPushEnabled(true);
      setPushPrompt(null);
      await pushSupport.refetch();
    } catch (pushError: any) {
      const message = String(pushError?.message || "");
      if (message.includes("DENIED") || message.includes("DEFAULT")) {
        await pushConsentDeclined.mutateAsync(credentials).catch(() => undefined);
        await pushSupport.refetch();
        setError("As notificações não foram ativadas. Você pode continuar conversando normalmente.");
      } else {
        setError("Não foi possível ativar os avisos neste navegador.");
      }
    } finally {
      setPushBusy(false);
    }
  };

  const declinePush = async () => {
    if (!credentials) return;
    setPushPrompt(null);
    await pushConsentDeclined.mutateAsync(credentials).catch(() => undefined);
    await pushSupport.refetch();
  };

  if (bootstrap.isPending || (!config && !error)) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0b141a] text-[#e9edef]">
        <div className="flex items-center gap-3 text-sm text-white/65">
          <Loader2 className="size-5 animate-spin text-[#00a884]" />
          Abrindo conversa segura…
        </div>
      </div>
    );
  }

  if (!config || !credentials) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0b141a] px-6 text-center text-[#e9edef]">
        <div>
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-white/5">
            <X className="size-6 text-white/50" />
          </div>
          <h1 className="text-lg font-semibold">Conversa indisponível</h1>
          <p className="mt-2 max-w-sm text-sm text-white/50">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="ravi-app-shell fixed inset-0 flex overflow-hidden bg-[#071015] text-[#e9edef] sm:items-center sm:justify-center sm:p-3"
      data-keyboard-open={keyboardOpen ? "true" : "false"}
      style={{ "--sim-accent": config.accentColor } as React.CSSProperties}
    >
      <div className="flex h-full w-full max-w-[620px] overflow-hidden bg-[#0b141a] shadow-2xl sm:max-h-[920px] sm:rounded-2xl sm:border sm:border-white/10">
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="ravi-header z-10 flex shrink-0 items-center gap-3 bg-[#202c33] px-3 shadow-sm sm:px-4">
            <Avatar config={config} size="md" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[15px] font-medium">{config.displayName}</h1>
              <p className="h-4 truncate text-[11px] text-[#8696a0]">
                {phase === "typing" || phase === "thinking" ? (
                  <span className="text-[var(--sim-accent)]">digitando…</span>
                ) : (
                  config.statusText
                )}
              </p>
            </div>
          </header>

          <section ref={messagesRef} className="sim-chat-bg min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3 [scrollbar-width:none] sm:px-4 sm:py-4">
            <div className="mx-auto mb-4 w-fit rounded-lg bg-[#182229] px-3 py-1.5 text-center text-[11px] text-[#8696a0] shadow">
              HOJE
            </div>
            <div className="space-y-1.5">
              {items.map((item, index) => (
                <MessageBubble
                  key={item.id}
                  item={item}
                  config={config}
                  showStartButton={index === 0 && !started}
                  onStart={startConversation}
                  onCheckout={openCheckout}
                  startBusy={busy}
                />
              ))}
              {(phase === "thinking" || phase === "typing") && <TypingBubble />}
              {mayOfferPush && (
                <div className="flex justify-start py-2">
                  <div className="max-w-[92%] rounded-xl border border-[var(--sim-accent)]/30 bg-[#17252c] p-3 shadow-lg">
                    <div className="flex items-start gap-3">
                      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--sim-accent)]/15 text-[var(--sim-accent)]">
                        <BellRing className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-[#e9edef]">Não perca a continuação</p>
                        <p className="mt-1 text-xs leading-relaxed text-[#aebac1]">
                          {config.push?.consentMessage}
                        </p>
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            onClick={enablePush}
                            disabled={pushBusy}
                            className="rounded-full bg-[var(--sim-accent)] px-4 py-2 text-xs font-semibold text-[#071611] disabled:opacity-60"
                          >
                            {pushBusy
                              ? "Ativando…"
                              : config.push?.consentButtonText || "QUERO RECEBER AVISOS"}
                          </button>
                          <button onClick={declinePush} className="px-2 py-2 text-xs text-[#8696a0]">
                            Agora não
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {showIosInstructions && strongInterest && (
                <div className="flex justify-start py-2">
                  <div className="max-w-[92%] rounded-xl border border-white/10 bg-[#202c33] p-4 shadow-lg">
                    <div className="flex gap-3">
                      <Share2 className="mt-0.5 size-5 shrink-0 text-[var(--sim-accent)]" />
                      <div>
                        <p className="text-sm font-semibold">Receber avisos no iPhone</p>
                        <p className="mt-1 text-xs leading-relaxed text-[#aebac1]">
                          Toque em <strong>Compartilhar</strong>, escolha <strong>Adicionar à Tela de Início</strong>, abra o Ravi pelo novo ícone e toque novamente em ativar avisos.
                        </p>
                        <button
                          onClick={() => setShowIosInstructions(false)}
                          className="mt-3 text-xs font-semibold text-[var(--sim-accent)]"
                        >
                          ENTENDI
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          </section>

          {error && (
            <div className="flex items-center justify-between border-t border-red-400/20 bg-red-950/60 px-3 py-2 text-xs text-red-100">
              <span>{error}</span>
              <button onClick={() => setError(null)} aria-label="Fechar aviso">
                <X className="size-4" />
              </button>
            </div>
          )}

          <footer className="ravi-composer z-10 shrink-0 bg-[#202c33] px-2 pt-1.5 sm:px-3 sm:pt-2">
            {recording ? (
              <div className="flex h-12 items-center gap-3">
                <button
                  onClick={cancelRecording}
                  className="grid size-10 place-items-center rounded-full text-[#ef5350] transition active:scale-95"
                  aria-label="Cancelar áudio"
                >
                  <X className="size-5" />
                </button>
                <div className="flex flex-1 items-center gap-3 rounded-full bg-[#2a3942] px-4 py-3">
                  <span className="size-2 animate-pulse rounded-full bg-[#ef5350]" />
                  <span className="font-mono text-sm text-[#e9edef]">
                    {formatDuration(recordingMs)}
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-r from-[#ef5350]/60 to-white/10" />
                </div>
                <button
                  onClick={stopRecording}
                  className="grid size-11 place-items-center rounded-full bg-[var(--sim-accent)] text-[#071611] transition active:scale-95"
                  aria-label="Enviar áudio"
                >
                  <Send className="size-5" />
                </button>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <div className="flex min-h-11 flex-1 items-center gap-2 rounded-3xl bg-[#2a3942] px-3 py-1.5">
                  <Smile className="size-5 shrink-0 text-[#8696a0]" />
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={text}
                    onChange={event => {
                      setText(event.target.value);
                      event.currentTarget.style.height = "32px";
                      event.currentTarget.style.height = `${Math.min(112, event.currentTarget.scrollHeight)}px`;
                    }}
                    onFocus={() => {
                      window.requestAnimationFrame(() => scrollToLatest("auto"));
                    }}
                    onKeyDown={event => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        queueText();
                      }
                    }}
                    disabled={!started || busy}
                    autoComplete="off"
                    autoCorrect="on"
                    autoCapitalize="sentences"
                    enterKeyHint="send"
                    placeholder={started ? config.inputPlaceholder : "Toque em SIM, QUERO SABER para começar"}
                    className="max-h-28 min-h-8 flex-1 resize-none overflow-y-auto bg-transparent py-1 text-[16px] leading-6 text-[#e9edef] outline-none placeholder:text-[#8696a0] disabled:cursor-not-allowed"
                  />
                  <Paperclip className="size-5 shrink-0 -rotate-45 text-[#8696a0]" />
                </div>
                <button
                  onClick={text.trim() ? queueText : beginRecording}
                  disabled={!started || busy || (phase === "waiting" && !text.trim())}
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--sim-accent)] text-[#071611] transition active:scale-95 disabled:opacity-40"
                  aria-label={text.trim() ? "Enviar mensagem" : "Gravar áudio"}
                >
                  {busy ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : text.trim() ? (
                    <Send className="size-5" />
                  ) : (
                    <Mic className="size-5" />
                  )}
                </button>
              </div>
            )}
          </footer>
        </main>
      </div>

      <style>{`
        .ravi-app-shell {
          height: 100vh;
          height: 100dvh;
          min-height: 0;
          background: #071015;
          overscroll-behavior: none;
          touch-action: none;
        }
        .ravi-header {
          height: calc(60px + env(safe-area-inset-top));
          padding-top: env(safe-area-inset-top);
        }
        .sim-chat-bg {
          touch-action: pan-y;
          -webkit-overflow-scrolling: touch;
          scroll-behavior: smooth;
        }
        .sim-chat-bg::-webkit-scrollbar { display: none; }
        .ravi-composer {
          padding-bottom: max(.5rem, env(safe-area-inset-bottom));
          box-shadow: 0 -1px 0 rgba(255,255,255,.04);
          touch-action: manipulation;
        }
        .ravi-app-shell[data-keyboard-open="true"] .ravi-composer {
          padding-bottom: .375rem;
        }
        .sim-chat-bg {
          background-color: #0b141a;
          background-image:
            linear-gradient(rgba(11,20,26,.93),rgba(11,20,26,.93)),
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Cg fill='none' stroke='%238696a0' stroke-width='1' opacity='.2'%3E%3Cpath d='M20 26h20v16H26l-6 6zM112 22l9 9-9 9-9-9zM48 105c8-12 20-12 28 0M130 112c0 8-6 14-14 14s-14-6-14-14 6-14 14-14 14 6 14 14zM18 154h30M145 54l18 18M163 54l-18 18'/%3E%3C/g%3E%3C/svg%3E");
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-pulse, .animate-spin { animation: none !important; }
          * { scroll-behavior: auto !important; }
        }
      `}</style>
    </div>
  );
}

function Avatar({ config, size }: { config: PublicConfig; size: "md" | "lg" }) {
  const cls = size === "lg" ? "size-12" : "size-10";
  return config.avatarUrl ? (
    <img
      src={config.avatarUrl}
      alt={config.displayName}
      className={`${cls} shrink-0 rounded-full object-cover`}
    />
  ) : (
    <div
      className={`${cls} grid shrink-0 place-items-center rounded-full text-sm font-bold text-[#071611]`}
      style={{ background: config.accentColor }}
    >
      {config.displayName.slice(0, 1).toUpperCase()}
    </div>
  );
}

function MessageBubble({
  item,
  config,
  showStartButton,
  onStart,
  onCheckout,
  startBusy,
}: {
  item: ChatItem;
  config: PublicConfig;
  showStartButton: boolean;
  onStart: () => void;
  onCheckout: (url: string) => void;
  startBusy: boolean;
}) {
  const outgoing = item.side === "lead";
  return (
    <div className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
      <div
        className={`relative max-w-[88%] rounded-lg px-2.5 py-1.5 text-[14.5px] leading-[1.38] shadow sm:max-w-[82%] ${
          outgoing ? "bg-[#005c4b]" : "bg-[#202c33]"
        }`}
      >
        {item.kind === "image" && item.mediaUrl && (
          <img src={item.mediaUrl} alt="" className="mb-1 max-h-[380px] w-full rounded-md object-cover" />
        )}
        {item.kind === "video" && item.mediaUrl && (
          <video src={item.mediaUrl} controls playsInline preload="metadata" className="mb-1 max-h-[380px] w-full rounded-md" />
        )}
        {item.kind === "audio" && (
          <AudioBubble url={item.mediaUrl || null} durationMs={item.durationMs || null} />
        )}
        {item.kind === "document" && (
          <a
            href={item.mediaUrl || "#"}
            target="_blank"
            rel="noreferrer"
            className="mb-1 flex items-center gap-3 rounded-md bg-black/15 p-3"
          >
            <FileText className="size-7" />
            <span className="min-w-0 flex-1 truncate text-sm">{item.filename || "Documento"}</span>
            <Download className="size-4 text-white/60" />
          </a>
        )}
        {item.text && <RichText text={item.text} />}
        {showStartButton && (
          <button
            onClick={onStart}
            disabled={startBusy}
            className="mt-3 w-full rounded-md border-t border-white/10 px-3 py-2.5 text-center text-xs font-bold tracking-wide text-[var(--sim-accent)] transition hover:bg-white/5 active:scale-[.98] disabled:opacity-50"
          >
            {startBusy ? "INICIANDO…" : config.startButtonText}
          </button>
        )}
        {item.kind === "checkout" && item.checkoutUrl && (
          <button
            onClick={() => onCheckout(item.checkoutUrl!)}
            className="mt-3 w-full rounded-md bg-[var(--sim-accent)] px-4 py-2.5 text-xs font-bold tracking-wide text-[#071611] transition hover:brightness-110 active:scale-[.98]"
          >
            {item.checkoutButtonText || config.checkoutButtonText}
          </button>
        )}
        <div className="mt-0.5 flex items-center justify-end gap-1 pl-10 text-[10.5px] text-white/50">
          {formatTime(item.ts)}
          {outgoing && <CheckCheck className="size-4 text-[#53bdeb]" />}
        </div>
      </div>
    </div>
  );
}

function RichText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <div className="whitespace-pre-wrap break-words">
      {parts.map((part, index) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={`${part}-${index}`}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="text-[#53bdeb] underline underline-offset-2"
          >
            {part}
          </a>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-lg bg-[#202c33] px-3 py-3 shadow">
        {[0, 1, 2].map(index => (
          <span
            key={index}
            className="size-1.5 animate-pulse rounded-full bg-[#8696a0]"
            style={{ animationDelay: `${index * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function AudioBubble({ url, durationMs }: { url: string | null; durationMs: number | null }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const toggle = async () => {
    if (!audioRef.current || !url) return;
    if (audioRef.current.paused) await audioRef.current.play();
    else audioRef.current.pause();
  };
  return (
    <div className="flex min-w-[230px] items-center gap-3 py-1">
      <button
        onClick={toggle}
        className="grid size-9 place-items-center rounded-full bg-white/10"
        aria-label={playing ? "Pausar áudio" : "Reproduzir áudio"}
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4 fill-current" />}
      </button>
      <div className="flex-1">
        <div className="flex h-6 items-end gap-[2px]">
          {[8, 15, 11, 19, 13, 22, 9, 17, 12, 20, 10, 16, 7, 14, 9, 18, 11, 15].map(
            (height, index) => (
              <span
                key={index}
                className="w-[3px] rounded-full bg-white/40"
                style={{ height }}
              />
            ),
          )}
        </div>
        <span className="text-[10px] text-white/45">{formatDuration(durationMs || 0)}</span>
      </div>
      {url && (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      )}
    </div>
  );
}

function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler áudio"));
    reader.readAsDataURL(blob);
  });
}

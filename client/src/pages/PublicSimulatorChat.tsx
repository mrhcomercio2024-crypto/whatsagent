import { trpc } from "@/lib/trpc";
import {
  calculateHumanInterMessageDelay,
  calculateHumanPreparationDelay,
  calculateHumanTypingDelay,
} from "@shared/humanTyping";
import {
  PUBLIC_REQUEST_RECOVERY_TIMEOUT_MS,
  publicRequestRecoveryDelay,
} from "@shared/publicRequestRecovery";
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
import {
  disableRaviPwaForLite,
  getPushCapability,
  registerRaviServiceWorker,
  subscribeBrowserToPush,
} from "../lib/webPush";
import ViewportDebugPanel from "../components/ViewportDebugPanel";

type PublicConfig = {
  slug: string;
  mode: "lite" | "advanced";
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
type PendingRequest = {
  requestId: string;
  createdAt: number;
  kind?: "start" | "text" | "audio";
  text?: string;
};
type RequestDebug = {
  sessionId: number | null;
  requestId: string | null;
  requestStatus: "idle" | "processing" | "completed" | "failed" | "expired";
  conversationId: number | null;
  lastHTTPStatus: number | null;
  lastResponseMs: number | null;
  recoveryAttempts: number;
  lastRecoveryResult: string | null;
  frontendError: string | null;
};

const DEFAULT_TIMING: Timing = {
  debounceSeconds: 2,
  typingSimulationEnabled: true,
  typingCps: 16,
  typingMinDelayMs: 650,
  typingMaxDelayMs: 3500,
  interMessageDelayMs: 850,
};

const DIRECT_REQUEST_TIMEOUT_MS = 30_000;
const LITE_REQUEST_TIMEOUT_MS = 45_000;
const MAX_REVEAL_TIME_MS = 15_000;

function sleep(ms: number) {
  return new Promise<void>(resolve => window.setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("CLIENT_REQUEST_TIMEOUT")), timeoutMs);
    promise.then(
      value => {
        window.clearTimeout(timer);
        resolve(value);
      },
      error => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function safePublicTiming(value: Partial<Timing> | null | undefined): Timing {
  return {
    debounceSeconds: Math.max(0, Math.min(2, Number(value?.debounceSeconds ?? DEFAULT_TIMING.debounceSeconds))),
    typingSimulationEnabled: value?.typingSimulationEnabled !== false,
    typingCps: Math.max(16, Math.min(45, Number(value?.typingCps ?? DEFAULT_TIMING.typingCps))),
    typingMinDelayMs: Math.max(250, Math.min(650, Number(value?.typingMinDelayMs ?? DEFAULT_TIMING.typingMinDelayMs))),
    typingMaxDelayMs: Math.max(650, Math.min(3500, Number(value?.typingMaxDelayMs ?? DEFAULT_TIMING.typingMaxDelayMs))),
    interMessageDelayMs: Math.max(350, Math.min(850, Number(value?.interMessageDelayMs ?? DEFAULT_TIMING.interMessageDelayMs))),
  };
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

function pendingRequestStorageKey(slug: string) {
  return `whatsagent:public-simulator:pending:${slug}`;
}

function readPendingRequest(slug: string): PendingRequest | null {
  try {
    const raw = localStorage.getItem(pendingRequestStorageKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingRequest>;
    if (!parsed.requestId || !parsed.createdAt) return null;
    if (Date.now() - parsed.createdAt > 10 * 60_000) {
      localStorage.removeItem(pendingRequestStorageKey(slug));
      return null;
    }
    return {
      requestId: parsed.requestId,
      createdAt: parsed.createdAt,
      kind: parsed.kind,
      text: parsed.text,
    };
  } catch {
    return null;
  }
}

function savePendingRequest(slug: string, pending: PendingRequest) {
  localStorage.setItem(
    pendingRequestStorageKey(slug),
    JSON.stringify(pending),
  );
}

function requestHttpStatus(error: any): number | null {
  const value = Number(error?.data?.httpStatus ?? error?.shape?.data?.httpStatus);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function clearPendingRequest(slug: string, requestId: string) {
  const current = readPendingRequest(slug);
  if (!current || current.requestId === requestId) {
    localStorage.removeItem(pendingRequestStorageKey(slug));
  }
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

export function mapHistory(messages: any[], config: PublicConfig): ChatItem[] {
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
  const utils = trpc.useUtils();

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
  const [liteRetryAvailable, setLiteRetryAvailable] = useState(false);
  const [slowNotice, setSlowNotice] = useState<string | null>(null);
  const [requestDebug, setRequestDebug] = useState<RequestDebug>({
    sessionId: null,
    requestId: null,
    requestStatus: "idle",
    conversationId: null,
    lastHTTPStatus: null,
    lastResponseMs: null,
    recoveryAttempts: 0,
    lastRecoveryResult: null,
    frontendError: null,
  });
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
  const itemsRef = useRef<ChatItem[]>([]);
  const revealRunRef = useRef(0);
  const recoveredOnMountRef = useRef(false);
  const sendLockRef = useRef(false);
  const liteRetryActionRef = useRef<null | (() => Promise<void>)>(null);

  const busy = phase === "thinking" || phase === "typing";
  const started = status !== "waiting";
  const pushSupport = trpc.publicSimulator.pushSupport.useQuery(
    credentials || { publicId: "invalid-public-session", token: "invalid-public-session-token" },
    { enabled: Boolean(credentials && config?.mode === "advanced"), refetchOnWindowFocus: false },
  );
  const pushCapability = useMemo(
    () => (typeof window === "undefined" ? null : getPushCapability()),
    [],
  );
  const consentEligible = Boolean(pushPrompt?.eligible || pushSupport.data?.consentEligible);
  const strongInterest = Boolean(pushPrompt?.strongInterest || pushSupport.data?.strongInterest);
  const mayOfferPush = Boolean(
    config?.mode === "advanced" &&
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
      // Com o teclado aberto, o Safari já mantém o textarea visível. Não
      // disputamos essa posição; fora do foco, rolamos o documento normalmente.
      if (document.activeElement === inputRef.current) return;
      endRef.current?.scrollIntoView({ behavior, block: "end" });
    });
  }, []);

  useEffect(() => {
    document.body.classList.add("ravi-public-page");
    return () => document.body.classList.remove("ravi-public-page");
  }, []);

  useEffect(() => {
    document.title = "Conversa com RAVI";
    sessionStorage.removeItem("ravi:asset-recovery");
    if (mountedRef.current) return;
    mountedRef.current = true;
    if (new URLSearchParams(window.location.search).get("noSW") === "1") {
      void disableRaviPwaForLite().then(result => console.info("[Ravi Lite noSW]", result));
    }
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
        setTiming(safePublicTiming(result.timing));
        setStatus(result.status);
        setRequestDebug(previous => ({
          ...previous,
          sessionId: result.internalSessionId,
          conversationId: result.conversationId,
        }));
        const historyItems = mapHistory(result.messages as any[], result.config as PublicConfig);
        itemsRef.current = historyItems;
        setItems(historyItems);
        const publicConfig = result.config as PublicConfig;
        const advanced = publicConfig.mode === "advanced";
        setPushEnabled(Boolean(advanced && publicConfig.push?.enabled));
        if (!advanced) {
          void disableRaviPwaForLite().then(cleanup => {
            console.info("[Ravi Lite cleanup]", cleanup);
            const reloadKey = "ravi:lite-sw-cleared";
            if (cleanup.hadController && sessionStorage.getItem(reloadKey) !== "1") {
              sessionStorage.setItem(reloadKey, "1");
              window.location.reload();
            }
          });
        } else if (publicConfig.push?.enabled) {
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
    setItems(previous => {
      const next = [
        ...previous,
        { id: crypto.randomUUID(), ts: item.ts ?? Date.now(), ...item } as ChatItem,
      ];
      itemsRef.current = next;
      return next;
    });
  }, []);

  const revealActions = useCallback(
    async (result: any) => {
      const runId = ++revealRunRef.current;
      const nextTiming = safePublicTiming(result?.timing || timing);
      const actions = Array.isArray(result?.actions) ? result.actions : [];
      const startedAt = Date.now();
      setTiming(nextTiming);
      try {
        for (let index = 0; index < actions.length; index += 1) {
          if (runId !== revealRunRef.current) return;
          const action = actions[index];
          const alreadyVisible =
            config?.mode === "advanced" &&
            itemsRef.current.some(item => {
              if (item.side !== "agent") return false;
              if (action.kind === "text") return item.kind === "text" && item.text === action.text;
              if (action.kind === "checkout") return item.kind === "checkout" && item.checkoutUrl === action.url;
              return item.kind === action.mediaType && item.mediaUrl === action.mediaUrl;
            });
          if (alreadyVisible) continue;

          const content = String(action.text || action.caption || action.filename || "mídia");
          const remaining = Math.max(0, MAX_REVEAL_TIME_MS - (Date.now() - startedAt));
          setPhase("typing");
          if (remaining > 0) {
            await sleep(Math.min(remaining, calculateHumanPreparationDelay(index)));
            const afterPreparation = Math.max(0, MAX_REVEAL_TIME_MS - (Date.now() - startedAt));
            const typingDelay =
              action.kind === "text" || action.kind === "checkout"
                ? calculateHumanTypingDelay(content, nextTiming)
                : Math.max(650, Math.min(1400, calculateHumanTypingDelay(content, nextTiming)));
            if (afterPreparation > 0) await sleep(Math.min(afterPreparation, typingDelay));
          }
          if (runId !== revealRunRef.current) return;
          if (action.kind === "text") {
            pushItem({ side: "agent", kind: "text", text: action.text });
          } else if (action.kind === "checkout") {
            pushItem({ side: "agent", kind: "checkout", text: action.text, checkoutUrl: action.url, checkoutButtonText: action.buttonText });
          } else {
            pushItem({ side: "agent", kind: action.mediaType, text: action.caption, mediaUrl: action.mediaUrl, filename: action.filename });
          }
          if (index < actions.length - 1) {
            setPhase("idle");
            const remainingBetween = Math.max(0, MAX_REVEAL_TIME_MS - (Date.now() - startedAt));
            if (remainingBetween > 0) {
              await sleep(Math.min(remainingBetween, calculateHumanInterMessageDelay(nextTiming.interMessageDelayMs)));
            }
          }
        }
      } finally {
        if (runId === revealRunRef.current) setPhase("idle");
      }
    },
    [config?.mode, pushItem, timing],
  );

  const recoverRequest = useCallback(
    async (pending: PendingRequest, retryOriginal?: () => Promise<any>) => {
      if (!credentials) throw new Error("Sessão indisponível");
      const deadline = Date.now() + PUBLIC_REQUEST_RECOVERY_TIMEOUT_MS;
      let attempt = 0;
      let retriedOriginal = false;
      setRequestDebug(previous => ({
        ...previous,
        requestId: pending.requestId,
        requestStatus: "processing",
        recoveryAttempts: 0,
        lastRecoveryResult: "recovery_started",
        frontendError: null,
      }));
      while (Date.now() < deadline) {
        try {
          const state = await utils.publicSimulator.requestStatus.fetch({
            ...credentials,
            requestId: pending.requestId,
            requestCreatedAt: pending.createdAt,
          });
          const recoveryAttempts = Math.max(attempt + 1, state.recoveryAttempts || 0);
          setRequestDebug(previous => ({
            ...previous,
            requestStatus: state.status,
            conversationId: state.conversationId,
            lastHTTPStatus: state.lastHttpStatus ?? 202,
            recoveryAttempts,
            lastRecoveryResult: state.registered ? state.status : "processing_unregistered",
            frontendError: null,
          }));
          if (state.status === "completed" && state.response) return state.response as any;
          if (state.status === "failed") {
            clearPendingRequest(slug, pending.requestId);
            throw new Error(state.errorMessage || "A resposta falhou");
          }
          if (state.status === "expired") {
            clearPendingRequest(slug, pending.requestId);
            throw new Error(state.errorMessage || "A requisição expirou. Envie a mensagem novamente.");
          }
          if (!state.registered && retryOriginal && !retriedOriginal) {
            retriedOriginal = true;
            setRequestDebug(previous => ({
              ...previous,
              lastRecoveryResult: "retrying_original_request",
            }));
            try {
              const retried = await withTimeout(retryOriginal(), DIRECT_REQUEST_TIMEOUT_MS);
              setRequestDebug(previous => ({
                ...previous,
                requestStatus: "completed",
                lastHTTPStatus: 200,
                lastRecoveryResult: "completed_after_idempotent_retry",
              }));
              return retried;
            } catch (retryError: any) {
              const retryStatus = requestHttpStatus(retryError);
              setRequestDebug(previous => ({
                ...previous,
                lastHTTPStatus: retryStatus,
                lastRecoveryResult:
                  retryStatus === 409 ? "original_request_already_processing" : "original_retry_waiting",
                frontendError: String(retryError?.message || "").slice(0, 180) || null,
              }));
            }
          }
        } catch (error: any) {
          const httpStatus = requestHttpStatus(error);
          const message = String(error?.message || "Falha temporária de recovery");
          setRequestDebug(previous => ({
            ...previous,
            lastHTTPStatus: httpStatus,
            recoveryAttempts: attempt + 1,
            lastRecoveryResult: "recovery_transport_error",
            frontendError: message.slice(0, 180),
          }));
          if (httpStatus === 401 || httpStatus === 403 || /expirou|resposta falhou/i.test(message)) {
            throw error;
          }
        }
        const delay = publicRequestRecoveryDelay(attempt);
        attempt += 1;
        await sleep(Math.min(delay, Math.max(0, deadline - Date.now())));
      }
      setRequestDebug(previous => ({
        ...previous,
        requestStatus: "expired",
        lastRecoveryResult: "recovery_deadline_expired",
        frontendError: "Tempo máximo de recuperação excedido",
      }));
      throw new Error("A resposta está demorando mais que o normal. Tente sincronizar novamente.");
    },
    [credentials, slug, utils.publicSimulator.requestStatus],
  );

  useEffect(() => {
    if (!credentials || !config || config.mode === "lite" || recoveredOnMountRef.current) return;
    const pending = readPendingRequest(slug);
    if (!pending) return;
    recoveredOnMountRef.current = true;
    setPhase("thinking");
    setSlowNotice("Recuperando a resposta…");
    const pendingText = pending.text;
    const pendingKind = pending.kind === "start" ? "start" : "text";
    const retryOriginal =
      pending.kind && pendingText
        ? () => sendText.mutateAsync({
            slug,
            ...credentials,
            requestId: pending.requestId,
            kind: pendingKind,
            text: pendingText,
          })
        : undefined;
    void recoverRequest(pending, retryOriginal)
      .then(async result => {
        setStatus("active");
        if (result.pushConsent) setPushPrompt(result.pushConsent);
        await revealActions(result);
        clearPendingRequest(slug, pending.requestId);
      })
      .catch(error => setError(error?.message || "Não foi possível recuperar a resposta."))
      .finally(() => {
        setSlowNotice(null);
        setPhase("idle");
      });
  }, [config, credentials, recoverRequest, revealActions, sendText, slug]);

  const processTextNow = useCallback(
    async (content: string, kind: "start" | "text" = "text") => {
      if (!credentials || !config) {
        sendLockRef.current = false;
        return;
      }
      const requestId = crypto.randomUUID();
      const pending: PendingRequest = { requestId, createdAt: Date.now(), kind, text: content };
      savePendingRequest(slug, pending);
      setRequestDebug(previous => ({
        ...previous,
        requestId,
        requestStatus: "processing",
        lastHTTPStatus: null,
        lastResponseMs: null,
        recoveryAttempts: 0,
        lastRecoveryResult: "sending_original_request",
        frontendError: null,
      }));
      if (config.mode === "lite") {
        const sendOriginal = () => sendText.mutateAsync({ slug, ...credentials, requestId, kind, text: content });
        const runLiteRequest = async () => {
          const startedAt = Date.now();
          sendLockRef.current = true;
          liteRetryActionRef.current = null;
          setLiteRetryAvailable(false);
          setError(null);
          setPhase("thinking");
          setSlowNotice(null);
          const slowTimer = window.setTimeout(() => setSlowNotice("Preparando sua resposta…"), 12_000);
          try {
            const result = await withTimeout(sendOriginal(), LITE_REQUEST_TIMEOUT_MS);
            setRequestDebug(previous => ({
              ...previous,
              requestStatus: "completed",
              lastHTTPStatus: 200,
              lastResponseMs: Date.now() - startedAt,
              lastRecoveryResult: "lite_request_completed",
              frontendError: null,
            }));
            setStatus("active");
            await revealActions(result);
            clearPendingRequest(slug, requestId);
          } catch (requestError: any) {
            const message = String(requestError?.message || "Falha ao responder").slice(0, 180);
            setRequestDebug(previous => ({
              ...previous,
              requestStatus: "failed",
              lastHTTPStatus: requestHttpStatus(requestError),
              lastResponseMs: Date.now() - startedAt,
              lastRecoveryResult: "lite_request_failed",
              frontendError: message,
            }));
            setError("Não consegui responder agora. Tentar novamente?");
            liteRetryActionRef.current = runLiteRequest;
            setLiteRetryAvailable(true);
          } finally {
            window.clearTimeout(slowTimer);
            setSlowNotice(null);
            setPhase("idle");
            sendLockRef.current = false;
          }
        };
        await runLiteRequest();
        return;
      }
      setPhase("thinking");
      setSlowNotice(null);
      const slowTimer = window.setTimeout(() => setSlowNotice("Preparando sua resposta…"), 12_000);
      try {
        let result: any;
        const sendOriginal = () => sendText.mutateAsync({ slug, ...credentials, requestId, kind, text: content });
        try {
          result = await withTimeout(
            sendOriginal(),
            DIRECT_REQUEST_TIMEOUT_MS,
          );
          setRequestDebug(previous => ({
            ...previous,
            requestStatus: "completed",
            lastHTTPStatus: 200,
            lastRecoveryResult: "original_request_completed",
          }));
        } catch (directError: any) {
          setRequestDebug(previous => ({
            ...previous,
            lastHTTPStatus: requestHttpStatus(directError),
            lastRecoveryResult: "original_request_timeout_or_error",
            frontendError: String(directError?.message || "").slice(0, 180) || null,
          }));
          setSlowNotice("Sincronizando a resposta…");
          result = await recoverRequest(pending, sendOriginal);
        }
        setStatus("active");
        if (result.pushConsent) setPushPrompt(result.pushConsent);
        await revealActions(result);
        clearPendingRequest(slug, requestId);
      } catch (err: any) {
        setRequestDebug(previous => ({
          ...previous,
          frontendError: String(err?.message || "Não foi possível enviar").slice(0, 180),
        }));
        setError(err?.message || "Não foi possível enviar. Tente novamente.");
      } finally {
        window.clearTimeout(slowTimer);
        setSlowNotice(null);
        setPhase("idle");
        sendLockRef.current = false;
      }
    },
    [config, credentials, recoverRequest, revealActions, sendText, slug],
  );

  const startConversation = async () => {
    if (!config || !credentials || started || busy || sendLockRef.current) return;
    sendLockRef.current = true;
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
    else {
      setPhase("idle");
      sendLockRef.current = false;
    }
  }, [processTextNow]);

  const queueText = () => {
    const value = text.trim();
    if (!value || !started || busy || recording || liteRetryAvailable || sendLockRef.current) return;
    sendLockRef.current = true;
    pushItem({ side: "lead", kind: "text", text: value });
    queueRef.current.push(value);
    setText("");
    if (inputRef.current) inputRef.current.style.height = "32px";
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
    sendLockRef.current = false;
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
  };

  const beginRecording = async () => {
    if (!started || busy || phase === "waiting" || recording || sendLockRef.current) return;
    sendLockRef.current = true;
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
        if (!blob.size || !credentials || !config) {
          sendLockRef.current = false;
          return;
        }
        if (blob.size > 16 * 1024 * 1024) {
          setError("O áudio deve ter no máximo 16 MB.");
          sendLockRef.current = false;
          return;
        }
        const localUrl = URL.createObjectURL(blob);
        pushItem({ side: "lead", kind: "audio", mediaUrl: localUrl, durationMs });
        const requestId = crypto.randomUUID();
        const pending: PendingRequest = {
          requestId,
          createdAt: Date.now(),
          kind: "audio",
        };
        savePendingRequest(slug, pending);
        setRequestDebug(previous => ({
          ...previous,
          requestId,
          requestStatus: "processing",
          lastHTTPStatus: null,
          lastResponseMs: null,
          recoveryAttempts: 0,
          lastRecoveryResult: "sending_original_audio_request",
          frontendError: null,
        }));
        setPhase("thinking");
        setSlowNotice(null);
        const slowTimer = window.setTimeout(() => setSlowNotice("Preparando seu áudio…"), 12_000);
        try {
          const base64 = await blobToBase64(blob);
          let result: any;
          const sendOriginal = () => sendAudio.mutateAsync({
            slug,
            ...credentials,
            requestId,
            audioBase64: base64,
            mimeType: blob.type.split(";")[0] || "audio/webm",
            durationMs,
          });
          if (config.mode === "lite") {
            const runLiteAudioRequest = async () => {
              const startedAt = Date.now();
              sendLockRef.current = true;
              liteRetryActionRef.current = null;
              setLiteRetryAvailable(false);
              setError(null);
              setPhase("thinking");
              setSlowNotice(null);
              const liteSlowTimer = window.setTimeout(() => setSlowNotice("Preparando seu áudio…"), 12_000);
              try {
                const liteResult = await withTimeout(sendOriginal(), LITE_REQUEST_TIMEOUT_MS);
                setRequestDebug(previous => ({
                  ...previous,
                  requestStatus: "completed",
                  lastHTTPStatus: 200,
                  lastResponseMs: Date.now() - startedAt,
                  lastRecoveryResult: "lite_audio_request_completed",
                  frontendError: null,
                }));
                setStatus("active");
                await revealActions(liteResult);
                clearPendingRequest(slug, requestId);
              } catch (requestError: any) {
                const message = String(requestError?.message || "Falha ao responder ao áudio").slice(0, 180);
                setRequestDebug(previous => ({
                  ...previous,
                  requestStatus: "failed",
                  lastHTTPStatus: requestHttpStatus(requestError),
                  lastResponseMs: Date.now() - startedAt,
                  lastRecoveryResult: "lite_audio_request_failed",
                  frontendError: message,
                }));
                setError("Não consegui responder agora. Tentar novamente?");
                liteRetryActionRef.current = runLiteAudioRequest;
                setLiteRetryAvailable(true);
              } finally {
                window.clearTimeout(liteSlowTimer);
                setSlowNotice(null);
                setPhase("idle");
                sendLockRef.current = false;
              }
            };
            window.clearTimeout(slowTimer);
            await runLiteAudioRequest();
            return;
          }
          try {
            result = await withTimeout(
              sendOriginal(),
              DIRECT_REQUEST_TIMEOUT_MS,
            );
            setRequestDebug(previous => ({
              ...previous,
              requestStatus: "completed",
              lastHTTPStatus: 200,
              lastRecoveryResult: "original_audio_request_completed",
            }));
          } catch (directError: any) {
            setRequestDebug(previous => ({
              ...previous,
              lastHTTPStatus: requestHttpStatus(directError),
              lastRecoveryResult: "original_audio_timeout_or_error",
              frontendError: String(directError?.message || "").slice(0, 180) || null,
            }));
            setSlowNotice("Sincronizando a resposta…");
            result = await recoverRequest(pending, sendOriginal);
          }
          setStatus("active");
          if (result.pushConsent) setPushPrompt(result.pushConsent);
          await revealActions(result);
          clearPendingRequest(slug, requestId);
        } catch (err: any) {
          setRequestDebug(previous => ({
            ...previous,
            frontendError: String(err?.message || "Não foi possível entender o áudio").slice(0, 180),
          }));
          setError(err?.message || "Não foi possível entender o áudio.");
        } finally {
          window.clearTimeout(slowTimer);
          setSlowNotice(null);
          setPhase("idle");
          sendLockRef.current = false;
        }
      };
      recorder.start(250);
      setRecording(true);
      recordingTimerRef.current = window.setInterval(
        () => setRecordingMs(Date.now() - recordingStartedRef.current),
        250,
      );
    } catch {
      sendLockRef.current = false;
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
      className="ravi-page w-full min-h-[100svh] bg-[#071015] text-[#e9edef]"
      style={{ "--sim-accent": config.accentColor } as React.CSSProperties}
    >
      <div className="mx-auto w-full max-w-[620px] bg-[#0b141a] shadow-2xl sm:border-x sm:border-white/10">
        <main className="ravi-shell flex min-h-[100svh] min-w-0 flex-col">
          <header className="ravi-header z-20 flex shrink-0 items-center gap-3 bg-[#202c33] px-3 shadow-sm sm:px-4">
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

          <section ref={messagesRef} className="ravi-messages sim-chat-bg w-full flex-1 overflow-visible px-2 py-3 sm:px-4 sm:py-4">
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
              {(phase === "thinking" || phase === "typing") && <TypingBubble label={slowNotice} />}
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
              <div className="ml-3 flex shrink-0 items-center gap-2">
                {config.mode === "lite" && liteRetryAvailable && (
                  <button
                    onClick={() => void liteRetryActionRef.current?.()}
                    className="rounded-full bg-red-100 px-3 py-1.5 font-semibold text-red-950"
                  >
                    TENTAR NOVAMENTE
                  </button>
                )}
                <button
                  onClick={() => {
                    setError(null);
                    setLiteRetryAvailable(false);
                    liteRetryActionRef.current = null;
                  }}
                  aria-label="Fechar aviso"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          )}

          <footer className="ravi-composer z-30 shrink-0 bg-[#202c33] px-2 pt-1.5 sm:px-3 sm:pt-2">
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
                      window.setTimeout(() => {
                        inputRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                      }, 180);
                    }}
                    onKeyDown={event => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        queueText();
                      }
                    }}
                    disabled={!started || busy || liteRetryAvailable}
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
                  onPointerDown={event => event.preventDefault()}
                  disabled={!started || busy || liteRetryAvailable || (phase === "waiting" && !text.trim())}
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
        .ravi-page {
          width: 100%;
          min-height: 100svh;
          background: #071015;
          overflow-x: hidden;
        }
        .ravi-header {
          position: sticky;
          top: 0;
          height: calc(60px + env(safe-area-inset-top));
          padding-top: env(safe-area-inset-top);
        }
        .ravi-messages {
          width: 100%;
          overflow: visible;
        }
        .sim-chat-bg {
          touch-action: pan-y;
          -webkit-overflow-scrolling: touch;
          scroll-behavior: smooth;
        }
        .sim-chat-bg::-webkit-scrollbar { display: none; }
        .ravi-composer {
          position: sticky;
          bottom: 0;
          padding-bottom: max(.5rem, env(safe-area-inset-bottom));
          box-shadow: 0 -1px 0 rgba(255,255,255,.04);
          touch-action: manipulation;
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
      <ViewportDebugPanel request={requestDebug} lite={config.mode === "lite"} />
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

function TypingBubble({ label }: { label?: string | null }) {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-2 rounded-lg bg-[#202c33] px-3 py-3 shadow">
        <span className="flex items-center gap-1">
          {[0, 1, 2].map(index => (
            <span
              key={index}
              className="size-1.5 animate-pulse rounded-full bg-[#8696a0]"
              style={{ animationDelay: `${index * 150}ms` }}
            />
          ))}
        </span>
        {label && <span className="text-[11px] text-[#aebac1]">{label}</span>}
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

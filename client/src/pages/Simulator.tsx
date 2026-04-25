import AppLayout from "@/components/AppLayout";
import { AgentRequired } from "@/components/AgentRequired";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  Camera,
  Image as ImageIcon,
  Mic,
  MoreVertical,
  Paperclip,
  Phone,
  RotateCcw,
  Send,
  Smile,
  Video as VideoIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Simulador de conversa: emulador visual do WhatsApp com timing real.
 * Respeita debounceSeconds, typing delays e interMessageDelay configurados no agente.
 */
export default function SimulatorPage() {
  return (
    <AppLayout>
      <AgentRequired>{agentId => <Inner agentId={agentId} />}</AgentRequired>
    </AppLayout>
  );
}

type ChatItem =
  | { kind: "user"; id: string; text: string; ts: number }
  | {
      kind: "bot";
      id: string;
      text?: string;
      mediaType?: "image" | "video" | "audio" | "document";
      mediaUrl?: string | null;
      caption?: string | null;
      ts: number;
    };

function Inner({ agentId }: { agentId: number }) {
  const { data: agent } = trpc.agents.get.useQuery({ id: agentId });
  const [items, setItems] = useState<ChatItem[]>([]);
  const [text, setText] = useState("");
  const [convId, setConvId] = useState<number | null>(null);
  const [pending, setPending] = useState(false); // aguardando debounce
  const [typing, setTyping] = useState(false); // bot digitando
  const [debounceLeft, setDebounceLeft] = useState(0);
  const debounceTimerRef = useRef<number | null>(null);
  const queueRef = useRef<string[]>([]);
  const send = trpc.simulator.sendMessage.useMutation();
  const reset = trpc.simulator.reset.useMutation();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items.length, typing]);

  const debounceSec = agent?.debounceSeconds ?? 8;

  function pushUser(t: string) {
    setItems(prev => [
      ...prev,
      { kind: "user", id: crypto.randomUUID(), text: t, ts: Date.now() },
    ]);
  }

  function pushBot(it: Omit<Extract<ChatItem, { kind: "bot" }>, "kind" | "id" | "ts">) {
    setItems(prev => [
      ...prev,
      { kind: "bot", id: crypto.randomUUID(), ts: Date.now(), ...it },
    ]);
  }

  function clearDebounceTimer() {
    if (debounceTimerRef.current !== null) {
      window.clearInterval(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }

  function scheduleProcessing() {
    clearDebounceTimer();
    setPending(true);
    let left = debounceSec;
    setDebounceLeft(left);
    debounceTimerRef.current = window.setInterval(() => {
      left -= 1;
      setDebounceLeft(left);
      if (left <= 0) {
        clearDebounceTimer();
        runProcessing();
      }
    }, 1000);
  }

  async function runProcessing() {
    const merged = queueRef.current.join("\n").trim();
    queueRef.current = [];
    setPending(false);
    setDebounceLeft(0);
    if (!merged) return;
    setTyping(true);
    try {
      const r = await send.mutateAsync({
        agentId,
        conversationId: convId ?? undefined,
        text: merged,
      });
      if (r.conversationId) setConvId(r.conversationId);

      const t = r.timing;
      // Reproduz cada ação com typing + delay proporcional + pausa entre mensagens
      for (let i = 0; i < r.actions.length; i++) {
        const act = r.actions[i];
        const len =
          act.kind === "text"
            ? act.text.length
            : (act.caption?.length ?? 0) + 60;
        const cps = Math.max(1, t.typingCps);
        const raw = Math.round((len / cps) * 1000);
        const min = Math.max(0, t.typingMinDelayMs);
        const max = Math.max(min, t.typingMaxDelayMs);
        const typingMs = t.typingSimulationEnabled
          ? Math.min(max, Math.max(min, raw))
          : 200;
        setTyping(true);
        await sleep(typingMs);
        setTyping(false);
        if (act.kind === "text") {
          pushBot({ text: act.text });
        } else {
          pushBot({
            mediaType: act.mediaType,
            mediaUrl: act.mediaUrl,
            caption: act.caption,
          });
        }
        if (i < r.actions.length - 1 && t.interMessageDelayMs > 0) {
          await sleep(t.interMessageDelayMs);
        }
      }
      if (r.outOfHours && r.actions.length === 0) {
        pushBot({ text: "(Fora do horário de atendimento)" });
      } else if (r.actions.length === 0) {
        pushBot({ text: "(Sem resposta — verifique cérebro/etapas)" });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao processar");
    } finally {
      setTyping(false);
    }
  }

  function submit() {
    const v = text.trim();
    if (!v) return;
    // Comando interno: zera a conversa local + servidor sem mandar pro pipeline.
    const RESET_RE = /^\/(limpar|clear|reset|start|restart)$/i;
    if (RESET_RE.test(v)) {
      setText("");
      void handleReset();
      return;
    }
    pushUser(v);
    queueRef.current.push(v);
    setText("");
    scheduleProcessing(); // todo input enfileira/reagenda
  }

  async function handleReset() {
    clearDebounceTimer();
    queueRef.current = [];
    setPending(false);
    setDebounceLeft(0);
    setTyping(false);
    if (convId) {
      try {
        await reset.mutateAsync({ conversationId: convId });
      } catch {}
    }
    setConvId(null);
    setItems([]);
    toast.success("Simulação reiniciada");
  }

  const phoneTitle = agent?.name || "WhatsAgent";

  return (
    <div className="container py-10 max-w-5xl">
      <PageHeader
        eyebrow="Teste"
        title="Emulador de WhatsApp"
        description="Conversa idêntica à do WhatsApp real, respeitando debounce, simulação de digitação e pausas configuradas no agente. Nenhuma mensagem é enviada de verdade."
        actions={
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={reset.isPending}
          >
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Reiniciar
          </Button>
        }
      />

      <div className="flex gap-6 items-start flex-col lg:flex-row">
        {/* Mockup do celular */}
        <div className="mx-auto">
          <PhoneFrame>
            <PhoneHeader title={phoneTitle} typing={typing} />
            <ChatBody items={items} typing={typing} endRef={endRef} />
            <ChatInput
              value={text}
              onChange={setText}
              onSubmit={submit}
            />
          </PhoneFrame>
        </div>

        {/* Painel de diagnóstico */}
        <DiagPanel
          agent={agent ?? null}
          pending={pending}
          debounceLeft={debounceLeft}
          typing={typing}
          itemsCount={items.length}
        />
      </div>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative rounded-[40px] p-3 shadow-2xl"
      style={{
        background: "linear-gradient(160deg,#1f1f1f 0%,#0a0a0a 100%)",
        width: 380,
      }}
    >
      <div
        className="rounded-[32px] overflow-hidden flex flex-col"
        style={{ height: 720, background: "#0b141a" }}
      >
        {children}
      </div>
    </div>
  );
}

function PhoneHeader({ title, typing }: { title: string; typing: boolean }) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 text-white"
      style={{ background: "#202c33" }}
    >
      <ArrowLeft className="h-5 w-5 opacity-80" />
      <div
        className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold"
        style={{ background: "#00a884", color: "#0b141a" }}
      >
        {title.slice(0, 1).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-[15px] truncate">{title}</div>
        <div className="text-[11px] text-white/60 h-4">
          {typing ? (
            <span style={{ color: "#00a884" }}>digitando…</span>
          ) : (
            <span>online</span>
          )}
        </div>
      </div>
      <VideoIcon className="h-5 w-5 opacity-80" />
      <Phone className="h-5 w-5 opacity-80" />
      <MoreVertical className="h-5 w-5 opacity-80" />
    </div>
  );
}

function ChatBody({
  items,
  typing,
  endRef,
}: {
  items: ChatItem[];
  typing: boolean;
  endRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5"
      style={{
        backgroundColor: "#0b141a",
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><g fill='%23182229' opacity='0.55'><circle cx='10' cy='10' r='1.2'/><circle cx='35' cy='40' r='1.2'/><circle cx='70' cy='15' r='1.2'/><circle cx='85' cy='65' r='1.2'/><circle cx='25' cy='85' r='1.2'/></g></svg>\")",
      }}
    >
      {items.length === 0 && !typing && (
        <div className="text-center text-white/40 text-xs mt-12 px-6">
          Envie a primeira mensagem como se fosse o lead. <br />
          Mande várias seguidas para ver o debounce em ação.
        </div>
      )}
      {items.map(it => (it.kind === "user" ? <UserBubble key={it.id} item={it} /> : <BotBubble key={it.id} item={it} />))}
      {typing && <TypingBubble />}
      <div ref={endRef} />
    </div>
  );
}

function timeStr(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function UserBubble({ item }: { item: Extract<ChatItem, { kind: "user" }> }) {
  return (
    <div className="flex justify-end">
      <div
        className="rounded-lg px-2.5 py-1.5 max-w-[78%] text-[14.5px] leading-snug shadow"
        style={{ background: "#005c4b", color: "#e9edef" }}
      >
        <div className="whitespace-pre-wrap">{item.text}</div>
        <div className="flex items-center justify-end gap-1 mt-0.5 text-[10.5px] text-white/70">
          {timeStr(item.ts)}
          <DoubleCheck />
        </div>
      </div>
    </div>
  );
}

function BotBubble({ item }: { item: Extract<ChatItem, { kind: "bot" }> }) {
  return (
    <div className="flex justify-start">
      <div
        className="rounded-lg px-2 py-1.5 max-w-[80%] text-[14.5px] leading-snug shadow"
        style={{ background: "#202c33", color: "#e9edef" }}
      >
        {item.mediaType === "image" && (
          <div className="mb-1">
            {item.mediaUrl ? (
              <img
                src={item.mediaUrl}
                alt=""
                className="rounded-md max-w-[260px] max-h-[260px] object-cover"
              />
            ) : (
              <Placeholder icon={<ImageIcon className="h-5 w-5" />} label="imagem" />
            )}
          </div>
        )}
        {item.mediaType === "video" && (
          <div className="mb-1">
            {item.mediaUrl ? (
              <video
                src={item.mediaUrl}
                controls
                className="rounded-md max-w-[260px] max-h-[260px]"
              />
            ) : (
              <Placeholder icon={<VideoIcon className="h-5 w-5" />} label="vídeo" />
            )}
          </div>
        )}
        {item.mediaType === "audio" && item.mediaUrl && (
          <audio src={item.mediaUrl} controls className="my-1" />
        )}
        {(item.text || item.caption) && (
          <div className="px-1 whitespace-pre-wrap">{item.text || item.caption}</div>
        )}
        <div className="flex items-center justify-end gap-1 mt-0.5 text-[10.5px] text-white/50 px-1">
          {timeStr(item.ts)}
        </div>
      </div>
    </div>
  );
}

function Placeholder({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div
      className="rounded-md flex items-center justify-center text-white/60 text-xs gap-2"
      style={{
        width: 220,
        height: 140,
        background: "#0f1a1f",
        border: "1px dashed rgba(255,255,255,0.1)",
      }}
    >
      {icon}
      <span className="uppercase tracking-wider">{label}</span>
    </div>
  );
}

function DoubleCheck() {
  return (
    <svg
      viewBox="0 0 16 12"
      width="16"
      height="12"
      style={{ color: "#53bdeb" }}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 6.5L4 9.5L9 4.5" />
      <path d="M6 6.5L9 9.5L15 3.5" />
    </svg>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div
        className="rounded-lg px-3 py-2.5 shadow flex items-center gap-1"
        style={{ background: "#202c33" }}
      >
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{
        background: "#8696a0",
        animation: "wa-bounce 1s infinite ease-in-out",
        animationDelay: `${delay}ms`,
      }}
    />
  );
}

function ChatInput({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const has = value.trim().length > 0;
  return (
    <div
      className="flex items-end gap-2 px-2 py-2"
      style={{ background: "#0b141a" }}
    >
      <div
        className="flex-1 flex items-center gap-2 rounded-3xl px-3 py-2"
        style={{ background: "#2a3942" }}
      >
        <Smile className="h-5 w-5 text-white/60 shrink-0" />
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Mensagem (digite /limpar para resetar)"
          className="flex-1 bg-transparent outline-none text-[15px] text-white placeholder:text-white/40"
        />
        <Paperclip className="h-5 w-5 text-white/60 shrink-0 -rotate-45" />
        <Camera className="h-5 w-5 text-white/60 shrink-0" />
      </div>
      <button
        onClick={onSubmit}
        className="h-11 w-11 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "#00a884", color: "#0b141a" }}
      >
        {has ? <Send className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
      </button>
    </div>
  );
}

function DiagPanel({
  agent,
  pending,
  debounceLeft,
  typing,
  itemsCount,
}: {
  agent: any;
  pending: boolean;
  debounceLeft: number;
  typing: boolean;
  itemsCount: number;
}) {
  const rows = useMemo(
    () => [
      { label: "Debounce", value: agent ? `${agent.debounceSeconds}s` : "—" },
      { label: "Simulação digitação", value: agent?.typingSimulationEnabled ? "ativa" : "desativada" },
      { label: "Velocidade", value: agent ? `${agent.typingCps} cps` : "—" },
      {
        label: "Atraso",
        value: agent ? `${agent.typingMinDelayMs}–${agent.typingMaxDelayMs} ms` : "—",
      },
      { label: "Pausa entre msgs", value: agent ? `${agent.interMessageDelayMs} ms` : "—" },
    ],
    [agent]
  );
  return (
    <div className="elevated-card rounded-2xl p-5 w-full lg:w-[320px] space-y-4">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Estado
        </div>
        <div className="mt-1 text-sm space-y-1">
          {pending && (
            <div className="flex items-center gap-2 text-amber-400">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              Aguardando debounce — {debounceLeft}s
            </div>
          )}
          {typing && (
            <div className="flex items-center gap-2 text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Agente digitando…
            </div>
          )}
          {!pending && !typing && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-muted-foreground" />
              Ocioso
            </div>
          )}
        </div>
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Configuração ativa
        </div>
        <div className="mt-2 divide-y divide-border/40">
          {rows.map(r => (
            <div
              key={r.label}
              className="flex items-center justify-between py-1.5 text-sm"
            >
              <span className="text-muted-foreground">{r.label}</span>
              <span className="font-medium">{r.value}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="text-xs text-muted-foreground leading-relaxed">
        Mensagens enviadas em rajada são unificadas em um único turno
        após o debounce, exatamente como no WhatsApp real. Mensagens (e mídias) são
        gravadas no histórico real desta conversa.
      </div>
      <div className="text-[11px] text-muted-foreground">
        Mensagens trocadas: <strong>{itemsCount}</strong>
      </div>
    </div>
  );
}

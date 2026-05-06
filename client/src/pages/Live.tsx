import { useEffect, useMemo, useRef, useState } from "react";
import { AgentRequired } from "@/components/AgentRequired";
import { PageHeader } from "@/components/PageHeader";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity,
  Clock,
  MessageSquare,
  Send,
  Sparkles,
  User2,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TypingPhase = "idle" | "thinking" | "writing" | "delivering";
type LeadTyping = "composing" | "paused" | "idle";

type PipelinePhase =
  | "scheduled"
  | "processing"
  | "composing"
  | "composed"
  | "sending"
  | "sent"
  | "error"
  | "idle";

interface PipelineState {
  phase: PipelinePhase;
  etaAt: number | null;
  label: string | null;
  messageIndex: number | null;
  messageCount: number | null;
  at: number; // ms epoch — quando esta fase entrou
}

const PIPELINE_IDLE: PipelineState = {
  phase: "idle",
  etaAt: null,
  label: null,
  messageIndex: null,
  messageCount: null,
  at: 0,
};

interface ConvLiveState {
  agentTyping: TypingPhase;
  leadTyping: LeadTyping;
  flashUntil: number;
  pipeline: PipelineState;
  /** Linha do tempo: até 12 últimos eventos para a barra inferior. */
  timeline: Array<{
    at: number;
    kind: "lead_msg" | "ai_msg" | "pipeline";
    label: string;
  }>;
}

const EMPTY_CONV: ConvLiveState = {
  agentTyping: "idle",
  leadTyping: "idle",
  flashUntil: 0,
  pipeline: PIPELINE_IDLE,
  timeline: [],
};

interface ActiveConv {
  conversationId: number;
  lastEventAt: number;
  lastMessageText: string | null;
  lastMessageDirection: "inbound" | "outbound" | null;
  agentTyping: TypingPhase;
  leadTyping: LeadTyping;
  unreadFlash: boolean;
  lead: { id: number; name: string | null; phone: string | null } | null;
  pipeline: PipelineState;
  timeline: ConvLiveState["timeline"];
}

/** Hook que assina o SSE global do agente e expõe o estado por conversa. */
function useAgentLiveStream(
  agentId: number,
  onMessage: () => void
): {
  connected: boolean;
  byConv: Map<number, ConvLiveState>;
} {
  const [connected, setConnected] = useState(false);
  const [byConv, setByConv] = useState<Map<number, ConvLiveState>>(
    () => new Map()
  );
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    const es = new EventSource(`/api/live/stream?agentId=${agentId}`, {
      withCredentials: true,
    });

    es.addEventListener("ready", () => setConnected(true));

    const updateConv = (
      convId: number,
      patch: (cur: ConvLiveState) => ConvLiveState
    ) => {
      setByConv((prev) => {
        const next = new Map(prev);
        const cur = next.get(convId) ?? EMPTY_CONV;
        next.set(convId, patch(cur));
        return next;
      });
    };

    const pushTimeline = (
      cur: ConvLiveState,
      entry: ConvLiveState["timeline"][number]
    ): ConvLiveState["timeline"] => {
      const t = [...cur.timeline, entry];
      // mantém só as 12 últimas
      return t.slice(-12);
    };

    es.addEventListener("typing.agent", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        updateConv(d.conversationId, (cur) => ({
          ...cur,
          agentTyping: d.phase,
        }));
      } catch {
        // ignored
      }
    });
    es.addEventListener("typing.lead", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        updateConv(d.conversationId, (cur) => ({
          ...cur,
          leadTyping: d.phase ?? d.state ?? "idle",
        }));
      } catch {
        // ignored
      }
    });
    es.addEventListener("pipeline", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        const phase: PipelinePhase = d.phase;
        const next: PipelineState = {
          phase,
          etaAt: d.etaAt ?? null,
          label: d.label ?? null,
          messageIndex: d.messageIndex ?? null,
          messageCount: d.messageCount ?? null,
          at: d.at ?? Date.now(),
        };
        updateConv(d.conversationId, (cur) => ({
          ...cur,
          pipeline: next,
          timeline: pushTimeline(cur, {
            at: next.at,
            kind: "pipeline",
            label: d.label ?? phase,
          }),
        }));
      } catch {
        // ignored
      }
    });
    es.addEventListener("message", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        const isInbound = d.message?.direction === "inbound";
        updateConv(d.conversationId, (cur) => ({
          ...cur,
          flashUntil: Date.now() + 4000,
          timeline: pushTimeline(cur, {
            at: Date.now(),
            kind: isInbound ? "lead_msg" : "ai_msg",
            label:
              (d.message?.body as string | null) ||
              (isInbound ? "(mídia recebida)" : "(mensagem enviada)"),
          }),
        }));
      } catch {
        // ignored
      }
      onMessageRef.current();
    });
    es.onerror = () => setConnected(false);

    return () => {
      es.close();
      setConnected(false);
    };
  }, [agentId]);

  return { connected, byConv };
}

function formatPhone(p: string | null | undefined): string {
  if (!p) return "";
  const d = p.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 12 && d.startsWith("55")) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  return p;
}

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 5_000) return "agora";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60000)}min`;
  return `${Math.floor(diff / 3_600_000)}h`;
}

function TypingDots({ label, color }: { label: string; color: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", color)}>
      <span className="inline-flex items-center gap-0.5">
        <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
        <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
        <span className="size-1.5 rounded-full bg-current animate-bounce" />
      </span>
      <span>{label}</span>
    </span>
  );
}

/** Conta os segundos até `etaAt`. Atualiza a cada 250ms. Retorna 0 se já passou. */
function useCountdown(etaAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (etaAt == null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [etaAt]);
  if (etaAt == null) return 0;
  return Math.max(0, Math.ceil((etaAt - now) / 1000));
}

/** Status tag ao lado do nome do agente. */
function AgentStatusBadge({
  pipeline,
  agentTyping,
}: {
  pipeline: PipelineState;
  agentTyping: TypingPhase;
}) {
  const seconds = useCountdown(
    pipeline.phase === "scheduled" ? pipeline.etaAt : null
  );

  // Prioriza pipeline (mais granular). Se pipeline ocioso, cai no agentTyping.
  if (pipeline.phase === "scheduled") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
        <Clock className="size-3" />
        {seconds > 0 ? `digita em ${seconds}s` : "iniciando…"}
      </span>
    );
  }
  if (pipeline.phase === "processing") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-medium text-blue-300">
        <Activity className="size-3 animate-pulse" />
        respondendo agora
      </span>
    );
  }
  if (pipeline.phase === "composing" || agentTyping === "thinking") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/15 px-2 py-0.5 text-[11px] font-medium text-purple-300">
        <Sparkles className="size-3 animate-pulse" />
        pensando…
      </span>
    );
  }
  if (
    pipeline.phase === "composed" ||
    agentTyping === "writing" ||
    agentTyping === "delivering"
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
        <span className="inline-flex items-center gap-0.5">
          <span className="size-1 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
          <span className="size-1 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
          <span className="size-1 rounded-full bg-current animate-bounce" />
        </span>
        digitando
        {pipeline.messageCount && pipeline.messageCount > 1
          ? ` (${pipeline.messageCount} balões)`
          : ""}
      </span>
    );
  }
  if (pipeline.phase === "sending") {
    const total = pipeline.messageCount ?? 0;
    const idx = (pipeline.messageIndex ?? 0) + 1;
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
        <Send className="size-3" />
        {total > 1 ? `enviando ${idx}/${total}` : "enviando…"}
      </span>
    );
  }
  if (pipeline.phase === "sent") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/20 px-2 py-0.5 text-[11px] font-medium text-emerald-200">
        <Zap className="size-3" />
        entregue
      </span>
    );
  }
  if (pipeline.phase === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-300">
        erro
      </span>
    );
  }
  return null;
}

function LeadStatusBadge({
  pipeline,
  leadTyping,
}: {
  pipeline: PipelineState;
  leadTyping: LeadTyping;
}) {
  if (leadTyping === "composing") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
        <span className="inline-flex items-center gap-0.5">
          <span className="size-1 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
          <span className="size-1 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
          <span className="size-1 rounded-full bg-current animate-bounce" />
        </span>
        digitando
      </span>
    );
  }
  if (
    pipeline.phase === "scheduled" ||
    pipeline.phase === "processing" ||
    pipeline.phase === "composing"
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-300/80">
        aguardando IA
      </span>
    );
  }
  return null;
}

function LiveContent({ agentId }: { agentId: number }) {
  const [selected, setSelected] = useState<number | null>(null);
  const utils = trpc.useUtils();
  const { data: agentData } = trpc.agents.get.useQuery({ id: agentId });
  const { data, isLoading } = trpc.live.listActive.useQuery(
    { agentId, limit: 50 },
    { refetchInterval: 5000 }
  );
  const { connected, byConv } = useAgentLiveStream(agentId, () => {
    utils.live.listActive.invalidate({ agentId });
    if (selected) utils.live.recentMessages.invalidate({ conversationId: selected });
  });

  // tick pra forçar re-render e atualizar relTime
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((x) => x + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const items: ActiveConv[] = useMemo(() => {
    const list = data?.items ?? [];
    return list.map((c) => {
      const live = byConv.get(c.conversationId);
      return {
        conversationId: c.conversationId,
        lastEventAt: c.lastEventAt,
        lastMessageText: c.lastMessageText ?? null,
        lastMessageDirection: c.lastMessageDirection ?? null,
        agentTyping: (live?.agentTyping ?? "idle") as TypingPhase,
        leadTyping: (live?.leadTyping ?? "idle") as LeadTyping,
        unreadFlash: live ? live.flashUntil > Date.now() : false,
        lead: c.lead ?? null,
        pipeline: live?.pipeline ?? PIPELINE_IDLE,
        timeline: live?.timeline ?? [],
      };
    });
  }, [data, byConv]);

  const totals = data?.totals ?? { active: 0, agentTyping: 0, leadTyping: 0 };

  // Auto-select primeira conversa ativa
  useEffect(() => {
    if (selected == null && items[0]) {
      setSelected(items[0].conversationId);
    }
  }, [items, selected]);

  const selectedConv = items.find((c) => c.conversationId === selected) ?? null;

  return (
    <div className="container py-6 space-y-4">
      <PageHeader
        title="Chats ao vivo"
        description="Acompanhe em tempo real cada conversa do agente — quem está digitando, mensagens chegando e respostas saindo."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Ativas (5min)</div>
              <div className="text-2xl font-semibold">{totals.active}</div>
            </div>
            <Activity className={cn("size-6", connected ? "text-emerald-400" : "text-muted-foreground")} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">IA digitando agora</div>
              <div className="text-2xl font-semibold">{totals.agentTyping}</div>
            </div>
            <Sparkles className="size-6 text-purple-400" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Lead digitando agora</div>
              <div className="text-2xl font-semibold">{totals.leadTyping}</div>
            </div>
            <User2 className="size-6 text-emerald-400" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] gap-4">
        {/* Lista lateral de conversas */}
        <Card className="overflow-hidden">
          <div className="px-3 py-2 border-b text-xs text-muted-foreground flex items-center justify-between">
            <span>Conversas ativas</span>
            <Badge variant={connected ? "default" : "secondary"} className={connected ? "bg-emerald-500/20 text-emerald-300" : ""}>
              {connected ? "Ao vivo" : "Conectando…"}
            </Badge>
          </div>
          <ScrollArea className="h-[60vh]">
            {isLoading && (
              <div className="p-3 space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 rounded bg-muted/40 animate-pulse" />
                ))}
              </div>
            )}
            {!isLoading && items.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center">
                Nenhuma conversa ativa nos últimos 5 minutos.
              </div>
            )}
            {items.map((c) => {
              const isSelected = selected === c.conversationId;
              return (
                <button
                  key={c.conversationId}
                  type="button"
                  onClick={() => setSelected(c.conversationId)}
                  className={cn(
                    "w-full text-left px-3 py-2 border-b hover:bg-accent/40 transition flex items-start gap-2",
                    isSelected && "bg-accent/60"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium truncate text-sm flex items-center gap-2 min-w-0">
                        <span className="truncate">{c.lead?.name || "(sem nome)"}</span>
                        <LeadStatusBadge
                          pipeline={c.pipeline}
                          leadTyping={c.leadTyping}
                        />
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {c.unreadFlash && (
                          <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {relTime(c.lastEventAt)}
                        </span>
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {formatPhone(c.lead?.phone)}
                    </div>
                    <div className="mt-1">
                      <AgentStatusBadge
                        pipeline={c.pipeline}
                        agentTyping={c.agentTyping}
                      />
                    </div>
                    {c.pipeline.phase === "idle" &&
                      c.agentTyping === "idle" &&
                      c.leadTyping !== "composing" &&
                      c.lastMessageText && (
                        <div className="text-xs text-muted-foreground truncate mt-1">
                          {c.lastMessageDirection === "outbound" ? "→ " : "← "}
                          {c.lastMessageText}
                        </div>
                      )}
                  </div>
                </button>
              );
            })}
          </ScrollArea>
        </Card>

        {/* Janela de chat */}
        {selected && selectedConv ? (
          <LiveChatWindow
            conversationId={selected}
            agentName={agentData?.name ?? "Agente"}
            leadName={selectedConv.lead?.name ?? "Lead"}
            agentTyping={selectedConv.agentTyping}
            leadTyping={selectedConv.leadTyping}
            pipeline={selectedConv.pipeline}
            timeline={selectedConv.timeline}
          />
        ) : (
          <Card className="flex items-center justify-center h-[60vh]">
            <CardContent className="text-center text-sm text-muted-foreground">
              <MessageSquare className="size-8 mx-auto mb-2 opacity-50" />
              Selecione uma conversa para acompanhar ao vivo.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function LiveChatWindow({
  conversationId,
  agentName,
  leadName,
  agentTyping,
  leadTyping,
  pipeline,
  timeline,
}: {
  conversationId: number;
  agentName: string;
  leadName: string;
  agentTyping: TypingPhase;
  leadTyping: LeadTyping;
  pipeline: PipelineState;
  timeline: ConvLiveState["timeline"];
}) {
  const { data, isLoading } = trpc.live.recentMessages.useQuery(
    { conversationId, limit: 50 },
    { refetchInterval: 5000 }
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messages = data?.messages ?? [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, agentTyping, leadTyping, pipeline.phase, pipeline.messageIndex]);

  const seconds = useCountdown(
    pipeline.phase === "scheduled" ? pipeline.etaAt : null
  );

  return (
    <Card className="overflow-hidden flex flex-col h-[60vh]">
      <div className="px-4 py-2 border-b flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-sm font-medium truncate flex items-center gap-2">
            <User2 className="size-4 text-emerald-400 shrink-0" />
            <span className="truncate">{leadName}</span>
            <LeadStatusBadge pipeline={pipeline} leadTyping={leadTyping} />
          </div>
          <span className="text-muted-foreground text-xs">↔</span>
          <div className="text-sm font-medium truncate flex items-center gap-2">
            <Sparkles className="size-4 text-purple-400 shrink-0" />
            <span className="truncate">{agentName}</span>
            <AgentStatusBadge pipeline={pipeline} agentTyping={agentTyping} />
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground shrink-0">
          #{conversationId}
        </div>
      </div>

      {/* Barra de progresso da pipeline */}
      <PipelineProgress pipeline={pipeline} secondsUntilTyping={seconds} />

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-background">
        {isLoading && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 rounded bg-muted/40 animate-pulse" />
            ))}
          </div>
        )}
        {!isLoading && messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-12">
            Sem mensagens nesta conversa.
          </div>
        )}
        {messages.map((m: any) => {
          const isOut = m.direction === "outbound";
          const time = new Date(m.createdAt).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          });
          return (
            <div
              key={m.id}
              className={cn(
                "flex",
                isOut ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "rounded-2xl px-3 py-2 max-w-[80%] text-sm shadow-sm",
                  isOut
                    ? "bg-emerald-600/30 text-emerald-50 rounded-br-sm"
                    : "bg-muted/70 text-foreground rounded-bl-sm"
                )}
              >
                <div className="whitespace-pre-wrap break-words">
                  {m.body || (m.contentType !== "text" ? `[${m.contentType}]` : "")}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 text-right">
                  {time}
                </div>
              </div>
            </div>
          );
        })}
        {/* Bolha de "digitando" do agente quando ele está em writing/delivering/sending */}
        {(agentTyping === "writing" ||
          agentTyping === "delivering" ||
          pipeline.phase === "sending" ||
          pipeline.phase === "composed") && (
          <div className="flex justify-end">
            <div className="rounded-2xl px-3 py-2 bg-emerald-600/20 text-emerald-200 rounded-br-sm text-xs">
              <TypingDots
                label={
                  pipeline.phase === "sending" && (pipeline.messageCount ?? 0) > 1
                    ? `enviando ${(pipeline.messageIndex ?? 0) + 1}/${pipeline.messageCount}`
                    : "digitando…"
                }
                color="text-emerald-200"
              />
            </div>
          </div>
        )}
        {leadTyping === "composing" && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-3 py-2 bg-muted/60 text-muted-foreground rounded-bl-sm text-xs">
              <TypingDots label="digitando…" color="text-emerald-300" />
            </div>
          </div>
        )}
      </div>

      {/* Linha do tempo de eventos da conversa */}
      <Timeline timeline={timeline} />
    </Card>
  );
}

function PipelineProgress({
  pipeline,
  secondsUntilTyping,
}: {
  pipeline: PipelineState;
  secondsUntilTyping: number;
}) {
  if (pipeline.phase === "idle") return null;

  const order: PipelinePhase[] = [
    "scheduled",
    "processing",
    "composing",
    "composed",
    "sending",
    "sent",
  ];
  const currentIdx = Math.max(0, order.indexOf(pipeline.phase));
  const labels: Record<PipelinePhase, string> = {
    scheduled: secondsUntilTyping > 0 ? `aguardando ${secondsUntilTyping}s` : "iniciando",
    processing: "preparando",
    composing: "pensando",
    composed: "compondo",
    sending:
      (pipeline.messageCount ?? 0) > 1
        ? `enviando ${(pipeline.messageIndex ?? 0) + 1}/${pipeline.messageCount}`
        : "enviando",
    sent: "entregue",
    error: "erro",
    idle: "",
  };

  return (
    <div className="px-4 py-2 border-b bg-muted/20">
      <div className="flex items-center gap-1.5">
        {order.map((p, i) => {
          const active = i <= currentIdx && pipeline.phase !== "error";
          const isCurrent = i === currentIdx;
          return (
            <div key={p} className="flex-1 flex items-center gap-1.5">
              <div
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-all",
                  active
                    ? isCurrent
                      ? "bg-emerald-400 animate-pulse"
                      : "bg-emerald-500/60"
                    : "bg-muted-foreground/20"
                )}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="text-[11px] text-muted-foreground truncate">
          {pipeline.label || labels[pipeline.phase]}
        </div>
        {pipeline.phase === "scheduled" && (
          <div className="text-[11px] font-mono text-amber-300">
            {secondsUntilTyping}s
          </div>
        )}
      </div>
    </div>
  );
}

function Timeline({ timeline }: { timeline: ConvLiveState["timeline"] }) {
  if (timeline.length === 0) return null;
  return (
    <div className="px-3 py-2 border-t bg-muted/10 max-h-24 overflow-y-auto">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        Linha do tempo
      </div>
      <div className="space-y-0.5">
        {timeline
          .slice()
          .reverse()
          .slice(0, 5)
          .map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className="text-muted-foreground tabular-nums w-12">
                {new Date(t.at).toLocaleTimeString("pt-BR", {
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  t.kind === "lead_msg"
                    ? "bg-blue-400"
                    : t.kind === "ai_msg"
                    ? "bg-emerald-400"
                    : "bg-purple-400"
                )}
              />
              <span className="truncate text-muted-foreground">{t.label}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

export default function Live() {
  return <AgentRequired>{(agentId) => <LiveContent agentId={agentId} />}</AgentRequired>;
}

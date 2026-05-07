import { useEffect, useMemo, useRef, useState } from "react";
import { AgentRequired } from "@/components/AgentRequired";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LeadHistoryDialog } from "@/components/LeadHistoryDialog";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCheck,
  CheckCircle,
  Clock,
  Flame,
  History,
  Image as ImageIcon,
  MessageSquare,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Search,
  Send,
  Snowflake,
  Sparkles,
  Sun,
  User,
  User2,
  Video,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ─────────────────────────────────────────────────────────────
 *  Tipos
 * ──────────────────────────────────────────────────────────── */

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
  at: number;
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

/* ─────────────────────────────────────────────────────────────
 *  SSE: stream global do agente (pipeline + typing por conversa)
 * ──────────────────────────────────────────────────────────── */

function useAgentLiveStream(
  agentId: number,
  onMessage: () => void,
): { connected: boolean; byConv: Map<number, ConvLiveState> } {
  const [connected, setConnected] = useState(false);
  const [byConv, setByConv] = useState<Map<number, ConvLiveState>>(
    () => new Map(),
  );
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined")
      return;
    const es = new EventSource(`/api/live/stream?agentId=${agentId}`, {
      withCredentials: true,
    });

    es.addEventListener("ready", () => setConnected(true));

    const updateConv = (
      convId: number,
      patch: (cur: ConvLiveState) => ConvLiveState,
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
      entry: ConvLiveState["timeline"][number],
    ): ConvLiveState["timeline"] => {
      const t = [...cur.timeline, entry];
      return t.slice(-12);
    };

    es.addEventListener("typing.agent", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        updateConv(d.conversationId, (cur) => ({
          ...cur,
          agentTyping: d.phase,
        }));
      } catch {}
    });
    es.addEventListener("typing.lead", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        updateConv(d.conversationId, (cur) => ({
          ...cur,
          leadTyping: d.phase ?? d.state ?? "idle",
        }));
      } catch {}
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
      } catch {}
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
      } catch {}
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

/* ─────────────────────────────────────────────────────────────
 *  Helpers visuais
 * ──────────────────────────────────────────────────────────── */

function formatPhone(p: string | null | undefined): string {
  if (!p) return "";
  const d = p.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55"))
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12 && d.startsWith("55"))
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
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

function TempBadge({ t }: { t: string | null | undefined }) {
  if (t === "hot")
    return (
      <Badge className="bg-destructive/15 text-destructive border-destructive/20 text-[10px]">
        <Flame className="h-2.5 w-2.5 mr-1" />
        quente
      </Badge>
    );
  if (t === "warm")
    return (
      <Badge className="bg-accent/15 text-accent border-accent/20 text-[10px]">
        <Sun className="h-2.5 w-2.5 mr-1" />
        morno
      </Badge>
    );
  if (t === "cold")
    return (
      <Badge variant="outline" className="text-[10px]">
        <Snowflake className="h-2.5 w-2.5 mr-1" />
        frio
      </Badge>
    );
  return null;
}

function AgentStatusBadge({
  pipeline,
  agentTyping,
}: {
  pipeline: PipelineState;
  agentTyping: TypingPhase;
}) {
  const seconds = useCountdown(
    pipeline.phase === "scheduled" ? pipeline.etaAt : null,
  );
  if (pipeline.phase === "scheduled")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
        <Clock className="size-3" />
        {seconds > 0 ? `digita em ${seconds}s` : "iniciando…"}
      </span>
    );
  if (pipeline.phase === "processing")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-medium text-blue-300">
        <Activity className="size-3 animate-pulse" />
        respondendo agora
      </span>
    );
  if (pipeline.phase === "composing" || agentTyping === "thinking")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/15 px-2 py-0.5 text-[11px] font-medium text-purple-300">
        <Sparkles className="size-3 animate-pulse" />
        pensando…
      </span>
    );
  if (
    pipeline.phase === "composed" ||
    agentTyping === "writing" ||
    agentTyping === "delivering"
  )
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
  if (pipeline.phase === "sent")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/20 px-2 py-0.5 text-[11px] font-medium text-emerald-200">
        <Zap className="size-3" />
        entregue
      </span>
    );
  if (pipeline.phase === "error")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-300">
        erro
      </span>
    );
  return null;
}

function LeadStatusBadge({
  pipeline,
  leadTyping,
}: {
  pipeline: PipelineState;
  leadTyping: LeadTyping;
}) {
  if (leadTyping === "composing")
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
  if (
    pipeline.phase === "scheduled" ||
    pipeline.phase === "processing" ||
    pipeline.phase === "composing"
  )
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-300/80">
        aguardando IA
      </span>
    );
  return null;
}

/* ─────────────────────────────────────────────────────────────
 *  Página unificada
 * ──────────────────────────────────────────────────────────── */

function ChatContent({ agentId }: { agentId: number }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"active" | "all">("active");
  const utils = trpc.useUtils();
  const { data: agentData } = trpc.agents.get.useQuery({ id: agentId });

  // Lista de "ativas" (últimos 5min) — fonte de verdade do live
  const { data: liveData } = trpc.live.listActive.useQuery(
    { agentId, limit: 50 },
    { refetchInterval: 5000 },
  );
  // Lista de TODAS conversas — para a aba "Todas" e como fallback
  const { data: allList } = trpc.conversations.list.useQuery(
    { agentId },
    { refetchInterval: 8000 },
  );

  const { connected, byConv } = useAgentLiveStream(agentId, () => {
    utils.live.listActive.invalidate({ agentId });
    utils.conversations.list.invalidate();
    if (selected != null) {
      utils.conversations.get.invalidate({ id: selected });
      utils.live.recentMessages.invalidate({ conversationId: selected });
    }
  });

  // tick para relTime
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((x) => x + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const activeItems: ActiveConv[] = useMemo(() => {
    const list = liveData?.items ?? [];
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
  }, [liveData, byConv]);

  // Mescla "active" com "all" para a aba "Todas" (active no topo, depois resto)
  const allItems: ActiveConv[] = useMemo(() => {
    const map = new Map<number, ActiveConv>();
    for (const a of activeItems) map.set(a.conversationId, a);
    for (const c of allList ?? []) {
      if (map.has(c.conv.id)) continue;
      map.set(c.conv.id, {
        conversationId: c.conv.id,
        lastEventAt: c.conv.lastMessageAt
          ? new Date(c.conv.lastMessageAt).getTime()
          : 0,
        lastMessageText: null,
        lastMessageDirection: null,
        agentTyping: "idle",
        leadTyping: "idle",
        unreadFlash: false,
        lead: {
          id: c.lead.id,
          name: c.lead.name,
          phone: c.lead.phoneNumber,
        },
        pipeline: PIPELINE_IDLE,
        timeline: [],
      });
    }
    return Array.from(map.values()).sort(
      (a, b) => b.lastEventAt - a.lastEventAt,
    );
  }, [activeItems, allList]);

  const items = tab === "active" ? activeItems : allItems;

  // Filtro de busca por nome ou telefone
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) =>
      [c.lead?.name, c.lead?.phone]
        .filter(Boolean)
        .some((s) => (s ?? "").toLowerCase().includes(q)),
    );
  }, [items, search]);

  const totals = liveData?.totals ?? {
    active: 0,
    agentTyping: 0,
    leadTyping: 0,
  };

  // Auto-select
  useEffect(() => {
    if (selected == null && filtered[0])
      setSelected(filtered[0].conversationId);
  }, [filtered, selected]);

  const selectedConv =
    items.find((c) => c.conversationId === selected) ?? null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] h-[calc(100vh-1px)]">
      {/* Coluna esquerda — lista */}
      <aside className="border-r border-border/60 flex flex-col bg-background/60 backdrop-blur min-h-0">
        <div className="px-4 pt-4 pb-3 border-b border-border/60 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-primary/80 font-medium">
                Atendimento
              </p>
              <h1 className="text-2xl font-serif mt-0.5">Chat</h1>
            </div>
            <Badge
              variant={connected ? "default" : "secondary"}
              className={cn(
                "text-[10px]",
                connected ? "bg-emerald-500/20 text-emerald-300" : "",
              )}
            >
              {connected ? "Ao vivo" : "Conectando…"}
            </Badge>
          </div>

          {/* KPIs compactos */}
          <div className="grid grid-cols-3 gap-1.5 text-[11px]">
            <div className="rounded-md bg-muted/30 px-2 py-1.5 text-center">
              <div className="text-muted-foreground">Ativas</div>
              <div className="font-semibold text-base leading-tight">
                {totals.active}
              </div>
            </div>
            <div className="rounded-md bg-purple-500/10 px-2 py-1.5 text-center">
              <div className="text-muted-foreground">IA</div>
              <div className="font-semibold text-base leading-tight text-purple-300">
                {totals.agentTyping}
              </div>
            </div>
            <div className="rounded-md bg-emerald-500/10 px-2 py-1.5 text-center">
              <div className="text-muted-foreground">Lead</div>
              <div className="font-semibold text-base leading-tight text-emerald-300">
                {totals.leadTyping}
              </div>
            </div>
          </div>

          {/* Tabs Ativas / Todas */}
          <div className="flex gap-1 rounded-md bg-muted/30 p-1">
            <button
              onClick={() => setTab("active")}
              className={cn(
                "flex-1 text-xs py-1.5 rounded transition",
                tab === "active"
                  ? "bg-background shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Ativas
            </button>
            <button
              onClick={() => setTab("all")}
              className={cn(
                "flex-1 text-xs py-1.5 rounded transition",
                tab === "all"
                  ? "bg-background shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Todas
            </button>
          </div>

          {/* Busca */}
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nome ou telefone"
              className="pl-9 h-9 bg-muted/40"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {filtered.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              {tab === "active"
                ? "Nenhuma conversa ativa nos últimos 5 minutos."
                : "Sem conversas ainda."}
            </div>
          )}
          <ul>
            {filtered.map((c) => {
              const isSelected = selected === c.conversationId;
              return (
                <li key={c.conversationId}>
                  <button
                    type="button"
                    onClick={() => setSelected(c.conversationId)}
                    className={cn(
                      "w-full text-left px-3 py-2 border-b border-border/30 hover:bg-sidebar-accent/40 transition flex items-start gap-2",
                      isSelected && "bg-sidebar-accent/60",
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium truncate text-sm flex items-center gap-2 min-w-0">
                          <span className="truncate">
                            {c.lead?.name || c.lead?.phone || "(sem nome)"}
                          </span>
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
                            {c.lastEventAt > 0 ? relTime(c.lastEventAt) : ""}
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
                            {c.lastMessageDirection === "outbound"
                              ? "→ "
                              : "← "}
                            {c.lastMessageText}
                          </div>
                        )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </aside>

      {/* Coluna direita — janela de chat completa */}
      <section className="overflow-hidden min-w-0">
        {selected && selectedConv ? (
          <ChatWindow
            key={selected}
            conversationId={selected}
            agentName={agentData?.name ?? "Agente"}
            agentTyping={selectedConv.agentTyping}
            leadTyping={selectedConv.leadTyping}
            pipeline={selectedConv.pipeline}
            timeline={selectedConv.timeline}
          />
        ) : (
          <div className="h-full grid place-items-center text-muted-foreground">
            <div className="text-center space-y-2">
              <MessageSquare className="h-10 w-10 mx-auto opacity-40" />
              <p>Selecione uma conversa à esquerda.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 *  Janela de chat (combina tudo: histórico + actions + live)
 * ──────────────────────────────────────────────────────────── */

function ChatWindow({
  conversationId,
  agentName,
  agentTyping,
  leadTyping,
  pipeline,
  timeline,
}: {
  conversationId: number;
  agentName: string;
  agentTyping: TypingPhase;
  leadTyping: LeadTyping;
  pipeline: PipelineState;
  timeline: ConvLiveState["timeline"];
}) {
  const utils = trpc.useUtils();
  const { data } = trpc.conversations.get.useQuery(
    { id: conversationId },
    { refetchInterval: 15000 },
  );
  const setPause = trpc.conversations.setPause.useMutation({
    onSuccess: () =>
      utils.conversations.get.invalidate({ id: conversationId }),
  });
  const setStatus = trpc.conversations.setStatus.useMutation({
    onSuccess: () =>
      utils.conversations.get.invalidate({ id: conversationId }),
  });
  const sendHuman = trpc.conversations.sendHumanMessage.useMutation({
    onSuccess: () => {
      utils.conversations.get.invalidate({ id: conversationId });
      setText("");
    },
    onError: (e) => toast.error(e.message),
  });

  const [text, setText] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [
    data?.messages?.length,
    agentTyping,
    leadTyping,
    pipeline.phase,
    pipeline.messageIndex,
  ]);

  const seconds = useCountdown(
    pipeline.phase === "scheduled" ? pipeline.etaAt : null,
  );

  if (!data)
    return (
      <div className="h-full grid place-items-center text-muted-foreground">
        Carregando…
      </div>
    );

  const leadName = data.lead?.name ?? data.lead?.phoneNumber ?? "Lead";

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header — Lead ↔ Agente com status badges */}
      <div className="border-b border-border/60 px-4 sm:px-6 py-3 bg-emerald-900/10">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="text-sm font-medium truncate flex items-center gap-2">
              <User2 className="size-4 text-emerald-400 shrink-0" />
              <span className="truncate">{leadName}</span>
              <LeadStatusBadge pipeline={pipeline} leadTyping={leadTyping} />
            </div>
            <span className="text-muted-foreground text-xs">↔</span>
            <div className="text-sm font-medium truncate flex items-center gap-2">
              <Sparkles className="size-4 text-purple-400 shrink-0" />
              <span className="truncate">{agentName}</span>
              <AgentStatusBadge
                pipeline={pipeline}
                agentTyping={agentTyping}
              />
            </div>
            {data.lead && <TempBadge t={data.lead.temperature} />}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setPause.mutate({
                  id: conversationId,
                  aiPaused: !data.conversation.aiPaused,
                })
              }
            >
              {data.conversation.aiPaused ? (
                <>
                  <Play className="h-3.5 w-3.5 mr-1" />
                  Retomar IA
                </>
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5 mr-1" />
                  Assumir
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setHistoryOpen(true)}
              disabled={!data.lead?.id}
            >
              <History className="h-3.5 w-3.5 mr-1" />
              Histórico
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setStatus.mutate({ id: conversationId, status: "closed" })
              }
            >
              <CheckCircle className="h-3.5 w-3.5 mr-1" />
              Fechar
            </Button>
            <span className="text-[10px] text-muted-foreground">
              #{conversationId}
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1 truncate">
          {data.lead?.phoneNumber}
        </p>
      </div>

      {/* Pipeline progress */}
      <PipelineProgress pipeline={pipeline} secondsUntilTyping={seconds} />

      {/* DLQ banner */}
      <DlqBanner conversationId={conversationId} />

      <LeadHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        leadId={data.lead?.id ?? null}
        leadName={data.lead?.name ?? data.lead?.phoneNumber ?? null}
      />

      {/* Mensagens */}
      <div
        className="flex-1 overflow-y-auto px-4 sm:px-10 py-6 space-y-2 min-h-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 0% 0%, rgba(16,185,129,0.04), transparent 40%), radial-gradient(circle at 100% 100%, rgba(16,185,129,0.04), transparent 40%)",
          backgroundColor: "rgba(8,12,10,0.6)",
        }}
      >
        {data.messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center mt-10">
            Sem mensagens nesta conversa ainda.
          </p>
        )}
        {data.messages.map((m: any) => (
          <Bubble key={m.id} m={m} />
        ))}

        {/* Bolha "digitando" do agente — usa pipeline OU agentTyping */}
        {(agentTyping === "writing" ||
          agentTyping === "delivering" ||
          pipeline.phase === "sending" ||
          pipeline.phase === "composed") && (
          <div className="flex justify-end">
            <div className="rounded-xl rounded-br-sm bg-emerald-600/80 text-white px-3.5 py-2 shadow-sm">
              <TypingDots
                label={
                  pipeline.phase === "sending" &&
                  (pipeline.messageCount ?? 0) > 1
                    ? `enviando ${(pipeline.messageIndex ?? 0) + 1}/${pipeline.messageCount}`
                    : "digitando…"
                }
                color="text-white"
              />
            </div>
          </div>
        )}
        {leadTyping === "composing" && (
          <div className="flex justify-start">
            <div className="rounded-xl rounded-bl-sm bg-zinc-800/80 text-zinc-100 px-3.5 py-2 shadow-sm">
              <TypingDots label="digitando…" color="text-emerald-300" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Linha do tempo (eventos recentes) */}
      <Timeline timeline={timeline} />

      {/* Input do operador */}
      <div className="border-t border-border/60 p-3 bg-background/70 backdrop-blur">
        {!data.conversation.aiPaused ? (
          <div className="text-xs text-muted-foreground text-center py-1.5">
            IA está respondendo automaticamente. Clique em{" "}
            <strong>Assumir</strong> para enviar manualmente.
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Digite uma mensagem como humano"
              className="bg-muted/40"
              onKeyDown={(e) => {
                if (e.key === "Enter" && text.trim()) {
                  sendHuman.mutate({ conversationId, text });
                }
              }}
            />
            <Button
              onClick={() => {
                if (text.trim()) sendHuman.mutate({ conversationId, text });
              }}
              disabled={sendHuman.isPending}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 *  Bubble (mensagem) — suporta texto, imagem, vídeo, áudio, doc
 * ──────────────────────────────────────────────────────────── */

function Bubble({ m }: { m: any }) {
  const isOut = m.direction === "outbound";
  const sender = m.sender as "lead" | "ai" | "human" | "system";
  const time = m.createdAt
    ? new Date(m.createdAt).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  return (
    <div className={cn("flex", isOut ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "relative rounded-xl px-3.5 py-2 max-w-[75%] text-sm shadow-sm",
          isOut
            ? sender === "human"
              ? "bg-emerald-700/70 text-white rounded-br-sm"
              : "bg-emerald-600 text-white rounded-br-sm"
            : "bg-zinc-800/80 text-zinc-100 rounded-bl-sm",
        )}
      >
        {sender !== "lead" && (
          <div className="flex items-center gap-1.5 mb-0.5 opacity-80 text-[9px] uppercase tracking-wider">
            {sender === "ai" && (
              <>
                <Bot className="h-2.5 w-2.5" /> IA
              </>
            )}
            {sender === "human" && (
              <>
                <User className="h-2.5 w-2.5" /> humano
              </>
            )}
            {sender === "system" && "sistema"}
          </div>
        )}
        {m.contentType === "text" && (
          <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
        )}
        {m.contentType === "image" && (
          <div className="space-y-1.5">
            {m.mediaUrl ? (
              <img
                src={m.mediaUrl}
                alt=""
                className="max-w-full max-h-72 rounded-lg object-cover"
              />
            ) : (
              <div className="flex items-center gap-2 italic opacity-90">
                <ImageIcon className="h-3 w-3" /> imagem
              </div>
            )}
            {m.body && (
              <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
            )}
          </div>
        )}
        {m.contentType === "video" && (
          <div className="space-y-1.5">
            {m.mediaUrl ? (
              <video
                controls
                className="max-w-full max-h-72 rounded-lg"
                src={m.mediaUrl}
              />
            ) : (
              <div className="flex items-center gap-2 italic opacity-90">
                <Video className="h-3 w-3" /> vídeo
              </div>
            )}
            {m.body && (
              <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
            )}
          </div>
        )}
        {m.contentType === "audio" && (
          <div className="space-y-1.5">
            {m.mediaUrl ? (
              <audio controls src={m.mediaUrl} className="w-64 max-w-full" />
            ) : (
              <div className="flex items-center gap-2 italic opacity-90">
                <Mic className="h-3 w-3" /> áudio
              </div>
            )}
            {m.body && (
              <p className="whitespace-pre-wrap leading-relaxed text-xs italic opacity-90">
                {m.body}
              </p>
            )}
          </div>
        )}
        {m.contentType === "document" && (
          <a
            className="underline text-xs"
            href={m.mediaUrl ?? "#"}
            target="_blank"
            rel="noreferrer"
          >
            Documento anexado
          </a>
        )}
        <div className="flex items-center gap-1 justify-end mt-1 text-[9px] opacity-70">
          <span>{time}</span>
          {isOut && <CheckCheck className="h-3 w-3" />}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 *  Pipeline progress + Timeline + DLQ
 * ──────────────────────────────────────────────────────────── */

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
    scheduled:
      secondsUntilTyping > 0 ? `aguardando ${secondsUntilTyping}s` : "iniciando",
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
                    : "bg-muted-foreground/20",
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
                    : "bg-purple-400",
                )}
              />
              <span className="truncate text-muted-foreground">{t.label}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

function DlqBanner({ conversationId }: { conversationId: number }) {
  const utils = trpc.useUtils();
  const { data } = trpc.messageRetries.countByConversation.useQuery(
    { conversationId },
    { refetchInterval: 8000 },
  );
  const flush = trpc.messageRetries.flushConversation.useMutation({
    onSuccess: (r) => {
      toast.success(
        r.updated === 0
          ? "Nada para reenviar"
          : `Reenviando ${r.updated} mensagem(ns) agora…`,
      );
      void utils.messageRetries.countByConversation.invalidate({
        conversationId,
      });
    },
    onError: (e) => toast.error(e.message),
  });
  const count = data?.count ?? 0;
  if (count === 0) return null;
  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 sm:px-10 py-2 flex items-center gap-3">
      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
      <p className="text-sm text-amber-200 flex-1">
        <strong>{count}</strong>{" "}
        {count === 1 ? "mensagem pendente" : "mensagens pendentes"} de envio.
        Serão reenviadas automaticamente quando a conexão voltar.
      </p>
      <Button
        size="sm"
        variant="outline"
        className="border-amber-500/40 text-amber-200 hover:bg-amber-500/20"
        disabled={flush.isPending}
        onClick={() => flush.mutate({ conversationId })}
      >
        <RefreshCw
          className={cn("h-3.5 w-3.5 mr-1", flush.isPending && "animate-spin")}
        />
        Reenviar agora
      </Button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 *  Export — encapsula com AppLayout + AgentRequired
 * ──────────────────────────────────────────────────────────── */

export default function Live() {
  return (
    <AppLayout>
      <AgentRequired>{(agentId) => <ChatContent agentId={agentId} />}</AgentRequired>
    </AppLayout>
  );
}

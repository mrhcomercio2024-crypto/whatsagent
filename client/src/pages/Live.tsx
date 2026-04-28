import { useEffect, useMemo, useRef, useState } from "react";
import { AgentRequired } from "@/components/AgentRequired";
import { PageHeader } from "@/components/PageHeader";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, MessageSquare, Sparkles, User2 } from "lucide-react";
import { cn } from "@/lib/utils";

type TypingPhase = "idle" | "thinking" | "writing" | "delivering";

interface ActiveConv {
  conversationId: number;
  lastEventAt: number;
  lastMessageText: string | null;
  lastMessageDirection: "inbound" | "outbound" | null;
  agentTyping: TypingPhase;
  leadTyping: "composing" | "paused" | "idle";
  unreadFlash: boolean;
  lead: { id: number; name: string | null; phone: string | null } | null;
}

/** Hook que assina o SSE global do agente e expõe o estado por conversa. */
function useAgentLiveStream(
  agentId: number,
  onMessage: () => void
): {
  connected: boolean;
  byConv: Map<number, { agentTyping: TypingPhase; leadTyping: "composing" | "paused" | "idle"; flashUntil: number }>;
} {
  const [connected, setConnected] = useState(false);
  const [byConv, setByConv] = useState<Map<number, { agentTyping: TypingPhase; leadTyping: "composing" | "paused" | "idle"; flashUntil: number }>>(
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
      patch: Partial<{
        agentTyping: TypingPhase;
        leadTyping: "composing" | "paused" | "idle";
        flashUntil: number;
      }>
    ) => {
      setByConv((prev) => {
        const next = new Map(prev);
        const cur = next.get(convId) ?? {
          agentTyping: "idle" as TypingPhase,
          leadTyping: "idle" as const,
          flashUntil: 0,
        };
        next.set(convId, { ...cur, ...patch });
        return next;
      });
    };

    es.addEventListener("typing.agent", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        updateConv(d.conversationId, { agentTyping: d.phase });
      } catch {
        // ignored
      }
    });
    es.addEventListener("typing.lead", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        updateConv(d.conversationId, { leadTyping: d.state });
      } catch {
        // ignored
      }
    });
    es.addEventListener("message", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        updateConv(d.conversationId, { flashUntil: Date.now() + 4000 });
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

function LiveContent({ agentId }: { agentId: number }) {
  const [selected, setSelected] = useState<number | null>(null);
  const utils = trpc.useUtils();
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
        leadTyping: live?.leadTyping ?? "idle",
        unreadFlash: live ? live.flashUntil > Date.now() : false,
        lead: c.lead ?? null,
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

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
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
                      <div className="font-medium truncate text-sm">
                        {c.lead?.name || "(sem nome)"}
                      </div>
                      <div className="flex items-center gap-1">
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
                    {c.agentTyping !== "idle" && (
                      <div className="mt-1">
                        <TypingDots
                          label={
                            c.agentTyping === "thinking"
                              ? "IA pensando"
                              : c.agentTyping === "writing"
                              ? "IA escrevendo"
                              : "IA enviando"
                          }
                          color="text-purple-300"
                        />
                      </div>
                    )}
                    {c.leadTyping === "composing" && (
                      <div className="mt-1">
                        <TypingDots label="Lead digitando" color="text-emerald-300" />
                      </div>
                    )}
                    {c.agentTyping === "idle" && c.leadTyping !== "composing" && c.lastMessageText && (
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
        {selected ? (
          <LiveChatWindow
            conversationId={selected}
            agentTyping={byConv.get(selected)?.agentTyping ?? "idle"}
            leadTyping={byConv.get(selected)?.leadTyping ?? "idle"}
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
  agentTyping,
  leadTyping,
}: {
  conversationId: number;
  agentTyping: TypingPhase;
  leadTyping: "composing" | "paused" | "idle";
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
  }, [messages.length, agentTyping, leadTyping]);

  return (
    <Card className="overflow-hidden flex flex-col h-[60vh]">
      <div className="px-4 py-2 border-b text-xs text-muted-foreground flex items-center justify-between">
        <span>Conversa #{conversationId}</span>
        <div className="flex items-center gap-3">
          {agentTyping !== "idle" && (
            <TypingDots
              label={
                agentTyping === "thinking"
                  ? "IA pensando"
                  : agentTyping === "writing"
                  ? "IA escrevendo"
                  : "IA enviando"
              }
              color="text-purple-300"
            />
          )}
          {leadTyping === "composing" && (
            <TypingDots label="Lead digitando" color="text-emerald-300" />
          )}
        </div>
      </div>
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
        {agentTyping !== "idle" && (
          <div className="flex justify-end">
            <div className="rounded-2xl px-3 py-2 bg-emerald-600/20 text-emerald-200 rounded-br-sm text-xs">
              <TypingDots
                label={
                  agentTyping === "thinking"
                    ? "pensando…"
                    : agentTyping === "writing"
                    ? "escrevendo…"
                    : "enviando…"
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
    </Card>
  );
}

export default function Live() {
  return <AgentRequired>{(agentId) => <LiveContent agentId={agentId} />}</AgentRequired>;
}

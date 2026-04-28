import AppLayout from "@/components/AppLayout";
import { AgentRequired } from "@/components/AgentRequired";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  Bot,
  CheckCircle,
  CheckCheck,
  Flame,
  History,
  Image as ImageIcon,
  MessageCircle,
  Mic,
  Pause,
  Play,
  Search,
  Send,
  Snowflake,
  Sun,
  User,
  Video,
} from "lucide-react";
import { LeadHistoryDialog } from "@/components/LeadHistoryDialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Aba Chat — substitui Inbox por uma experi\u00eancia estilo WhatsApp Web,
 * com atualiza\u00e7\u00e3o em tempo real (polling curto), indicador "digitando…"
 * dos dois lados, mídias, áudio, pausar IA / assumir handoff.
 */
export default function ChatPage() {
  return (
    <AppLayout>
      <AgentRequired>{agentId => <Inner agentId={agentId} />}</AgentRequired>
    </AppLayout>
  );
}

/**
 * useChatStream — assina o SSE em /api/chat/stream/:conversationId.
 * Retorna a fase de typing da IA e dispara callbacks quando chegam
 * eventos de mensagem ou status. Cai silenciosamente em fallback se
 * o EventSource não estiver disponível ou o servidor responder erro.
 */
function useChatStream(
  conversationId: number | null,
  handlers: {
    onMessage?: () => void;
    onStatus?: () => void;
  }
) {
  const [agentPhase, setAgentPhase] = useState<
    "idle" | "thinking" | "writing" | "delivering"
  >("idle");
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!conversationId) {
      setConnected(false);
      setAgentPhase("idle");
      return;
    }
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;

    const es = new EventSource(`/api/chat/stream/${conversationId}`, {
      withCredentials: true,
    });
    let phaseTimer: ReturnType<typeof setTimeout> | null = null;

    es.addEventListener("ready", () => setConnected(true));
    es.addEventListener("message", () => {
      handlersRef.current.onMessage?.();
      setAgentPhase("idle");
    });
    es.addEventListener("status", () => {
      handlersRef.current.onStatus?.();
    });
    es.addEventListener("typing.agent", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const phase = (data?.phase ?? "idle") as typeof agentPhase;
        setAgentPhase(phase);
        if (phaseTimer) clearTimeout(phaseTimer);
        if (phase !== "idle") {
          // safety net: limpa o indicador se a IA travar e não emitir idle
          phaseTimer = setTimeout(() => setAgentPhase("idle"), 30_000);
        }
      } catch {
        // ignored
      }
    });
    es.onerror = () => {
      // Fechamos para deixar o navegador reabrir; se falhar persistente,
      // o componente Conversation segue funcionando via refetch periódico.
      setConnected(false);
    };

    return () => {
      if (phaseTimer) clearTimeout(phaseTimer);
      es.close();
      setConnected(false);
      setAgentPhase("idle");
    };
  }, [conversationId]);

  return { agentPhase, connected };
}

function Inner({ agentId }: { agentId: number }) {
  // Polling longo só para a lista lateral (resumo); o detalhe vem por SSE.
  const { data: list } = trpc.conversations.list.useQuery(
    { agentId },
    { refetchInterval: 8000 }
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!selectedId && list && list.length > 0) setSelectedId(list[0].conv.id);
  }, [list, selectedId]);

  const filtered = useMemo(() => {
    if (!list) return [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(c =>
      [c.lead.name, c.lead.phoneNumber]
        .filter(Boolean)
        .some(s => (s ?? "").toLowerCase().includes(q))
    );
  }, [list, search]);

  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-[340px_1fr] h-[calc(100vh-1px)]"
      style={{
        background:
          "linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--background)) 100%)",
      }}
    >
      {/* Lateral: lista de conversas */}
      <aside className="border-r border-border/60 flex flex-col bg-background/60 backdrop-blur">
        <div className="px-4 pt-4 pb-3 border-b border-border/60">
          <p className="text-[10px] uppercase tracking-[0.18em] text-primary/80 font-medium">
            Atendimento
          </p>
          <h1 className="text-2xl font-serif mt-0.5">Chat</h1>
          <div className="relative mt-3">
            <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar nome ou telefone"
              className="pl-9 h-9 bg-muted/40"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!list || list.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              Sem conversas ainda. Mensagens recebidas aparecer\u00e3o aqui.
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              Nenhuma conversa corresponde \u00e0 busca.
            </div>
          ) : (
            <ul>
              {filtered.map(c => (
                <li key={c.conv.id}>
                  <button
                    onClick={() => setSelectedId(c.conv.id)}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-sidebar-accent/40 transition-colors border-b border-border/30 ${
                      selectedId === c.conv.id ? "bg-sidebar-accent/60" : ""
                    }`}
                  >
                    <Avatar className="h-11 w-11 border shrink-0">
                      <AvatarFallback className="bg-primary/15 text-primary text-xs font-medium">
                        {(c.lead.name ?? c.lead.phoneNumber).slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium truncate">
                          {c.lead.name ?? c.lead.phoneNumber}
                        </p>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {c.conv.lastMessageAt
                            ? new Date(c.conv.lastMessageAt).toLocaleTimeString(
                                "pt-BR",
                                { hour: "2-digit", minute: "2-digit" }
                              )
                            : ""}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {c.lead.phoneNumber}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <TempBadge t={c.lead.temperature} />
                        {c.conv.aiPaused && (
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <Pause className="h-2.5 w-2.5" />
                            humano
                          </Badge>
                        )}
                        {c.conv.status === "human_handoff" && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-amber-500/30 text-amber-300"
                          >
                            handoff
                          </Badge>
                        )}
                        {c.conv.status === "closed" && (
                          <Badge variant="outline" className="text-[10px]">
                            fechada
                          </Badge>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Painel: conversa */}
      <section className="overflow-hidden">
        {selectedId ? (
          <Conversation key={selectedId} convId={selectedId} />
        ) : (
          <div className="h-full grid place-items-center text-muted-foreground">
            <div className="text-center space-y-2">
              <MessageCircle className="h-10 w-10 mx-auto opacity-40" />
              <p>Selecione uma conversa \u00e0 esquerda.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Conversation({ convId }: { convId: number }) {
  const utils = trpc.useUtils();
  // Sem polling agressivo: o SSE invalida a query quando algo muda.
  // Mantemos um refetch lento (15s) como cinto de segurança contra perdas.
  const { data } = trpc.conversations.get.useQuery(
    { id: convId },
    { refetchInterval: 15000 }
  );
  const { agentPhase, connected: sseConnected } = useChatStream(convId, {
    onMessage: () => {
      utils.conversations.get.invalidate({ id: convId });
      // também atualiza a lista lateral (última mensagem, horário, badges)
      utils.conversations.list.invalidate();
    },
    onStatus: () => {
      utils.conversations.get.invalidate({ id: convId });
      utils.conversations.list.invalidate();
    },
  });
  const setPause = trpc.conversations.setPause.useMutation({
    onSuccess: () => utils.conversations.get.invalidate({ id: convId }),
  });
  const setStatus = trpc.conversations.setStatus.useMutation({
    onSuccess: () => utils.conversations.get.invalidate({ id: convId }),
  });
  const sendHuman = trpc.conversations.sendHumanMessage.useMutation({
    onSuccess: () => {
      utils.conversations.get.invalidate({ id: convId });
      setText("");
    },
    onError: e => toast.error(e.message),
  });

  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  // Live typing do humano (só visual, exibido para o operador)
  const [humanTyping, setHumanTyping] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages?.length]);

  if (!data)
    return (
      <div className="h-full grid place-items-center text-muted-foreground">
        Carregando…
      </div>
    );

  // IA "digitando": preferência para o sinal real do SSE; cai para o
  // heurístico antigo (pendingProcessAt) caso o SSE não esteja conectado.
  const aiTyping = sseConnected
    ? agentPhase !== "idle"
    : !!data.conversation.pendingProcessAt &&
      new Date(data.conversation.pendingProcessAt).getTime() > Date.now() - 8000;
  const aiPhaseLabel =
    agentPhase === "thinking"
      ? "IA pensando…"
      : agentPhase === "writing"
        ? "IA digitando…"
        : agentPhase === "delivering"
          ? "IA enviando…"
          : "IA digitando…";

  return (
    <div className="flex flex-col h-full">
      {/* Header estilo WhatsApp Web */}
      <div className="border-b border-border/60 px-6 py-3 flex items-center justify-between gap-4 bg-emerald-900/20">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="h-10 w-10 border shrink-0">
            <AvatarFallback className="bg-primary/15 text-primary text-xs font-medium">
              {(data.lead?.name ?? data.lead?.phoneNumber ?? "??")
                .slice(0, 2)
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-medium truncate">
              {data.lead?.name ?? data.lead?.phoneNumber}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {data.lead?.phoneNumber}
              {aiTyping && (
                <span className="ml-2 inline-flex items-center gap-1 text-emerald-400">
                  <TypingDots /> {aiPhaseLabel}
                </span>
              )}
              {!aiTyping && humanTyping && data.conversation.aiPaused && (
                <span className="ml-2 text-emerald-400">você está digitando…</span>
              )}
            </p>
          </div>
          {data.lead && <TempBadge t={data.lead.temperature} />}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setPause.mutate({ id: convId, aiPaused: !data.conversation.aiPaused })
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
            onClick={() => setStatus.mutate({ id: convId, status: "closed" })}
          >
            <CheckCircle className="h-3.5 w-3.5 mr-1" />
            Fechar
          </Button>
        </div>
      </div>

      <LeadHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        leadId={data.lead?.id ?? null}
        leadName={data.lead?.name ?? data.lead?.phoneNumber ?? null}
      />

      {/* Stream de mensagens com fundo característico */}
      <div
        className="flex-1 overflow-y-auto px-4 sm:px-10 py-6 space-y-2"
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
        {data.messages.map(m => (
          <Bubble key={m.id} m={m} />
        ))}
        {aiTyping && <TypingBubble />}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border/60 p-3 bg-background/70 backdrop-blur">
        {!data.conversation.aiPaused ? (
          <div className="text-xs text-muted-foreground text-center py-1.5">
            IA está respondendo automaticamente nesta conversa. Clique em{" "}
            <strong>Assumir</strong> para enviar manualmente.
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              value={text}
              onChange={e => {
                setText(e.target.value);
                setHumanTyping(e.target.value.length > 0);
              }}
              placeholder="Digite uma mensagem"
              className="bg-muted/40"
              onKeyDown={e => {
                if (e.key === "Enter" && text.trim()) {
                  sendHuman.mutate({ conversationId: convId, text });
                  setHumanTyping(false);
                }
              }}
            />
            <Button
              onClick={() => {
                if (text.trim()) {
                  sendHuman.mutate({ conversationId: convId, text });
                  setHumanTyping(false);
                }
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
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className={`relative rounded-xl px-3.5 py-2 max-w-[75%] text-sm shadow-sm ${
          isOut
            ? sender === "human"
              ? "bg-emerald-700/70 text-white rounded-br-sm"
              : "bg-emerald-600 text-white rounded-br-sm"
            : "bg-zinc-800/80 text-zinc-100 rounded-bl-sm"
        }`}
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
            {m.body && <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>}
          </div>
        )}
        {m.contentType === "video" && (
          <div className="space-y-1.5">
            {m.mediaUrl ? (
              <video controls className="max-w-full max-h-72 rounded-lg" src={m.mediaUrl} />
            ) : (
              <div className="flex items-center gap-2 italic opacity-90">
                <Video className="h-3 w-3" /> v\u00eddeo
              </div>
            )}
            {m.body && <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>}
          </div>
        )}
        {m.contentType === "audio" && (
          <div className="space-y-1.5">
            {m.mediaUrl ? (
              <audio controls src={m.mediaUrl} className="w-64 max-w-full" />
            ) : (
              <div className="flex items-center gap-2 italic opacity-90">
                <Mic className="h-3 w-3" /> \u00e1udio
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

function TypingBubble() {
  return (
    <div className="flex justify-end">
      <div className="rounded-xl rounded-br-sm bg-emerald-600/80 text-white px-3.5 py-2 shadow-sm">
        <TypingDots />
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5 align-middle">
      <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" />
    </span>
  );
}

function TempBadge({ t }: { t: string }) {
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

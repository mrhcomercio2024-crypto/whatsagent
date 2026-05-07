import AppLayout from "@/components/AppLayout";
import { AgentRequired } from "@/components/AgentRequired";
import { EmptyState } from "@/components/PageHeader";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  Bot,
  CheckCircle,
  Flame,
  Image as ImageIcon,
  Inbox as InboxIcon,
  Pause,
  Play,
  Send,
  Snowflake,
  Sun,
  User,
  Video,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export default function InboxPage() {
  return (
    <AppLayout>
      <AgentRequired>{agentId => <Inner agentId={agentId} />}</AgentRequired>
    </AppLayout>
  );
}

function Inner({ agentId }: { agentId: number }) {
  const { data: list, refetch } = trpc.conversations.list.useQuery(
    { agentId },
    { refetchInterval: 5000 }
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (!selectedId && list && list.length > 0) setSelectedId(list[0].conv.id);
  }, [list, selectedId]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] h-[calc(100vh-1px)]">
      <div className="border-r border-border/60 overflow-y-auto">
        <div className="px-4 py-4 border-b border-border/60 sticky top-0 bg-background/80 backdrop-blur z-10">
          <p className="text-[10px] uppercase tracking-[0.18em] text-primary/80 font-medium">
            Inbox
          </p>
          <h1 className="text-2xl font-serif mt-0.5">Conversas</h1>
        </div>
        {!list || list.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<InboxIcon className="h-5 w-5" />}
              title="Sem conversas"
              description="Quando o WhatsApp começar a receber mensagens, elas aparecerão aqui."
            />
          </div>
        ) : (
          <ul>
            {list.map(c => (
              <li key={c.conv.id}>
                <button
                  onClick={() => setSelectedId(c.conv.id)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-sidebar-accent/40 transition-colors border-b border-border/30 ${
                    selectedId === c.conv.id ? "bg-sidebar-accent/60" : ""
                  }`}
                >
                  <Avatar className="h-10 w-10 border shrink-0">
                    <AvatarFallback className="bg-primary/15 text-primary text-xs font-medium">
                      {(c.lead.name ?? c.lead.phoneNumber).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium truncate">{c.lead.name ?? c.lead.phoneNumber}</p>
                      <TempBadge t={c.lead.temperature} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {c.lead.phoneNumber}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {c.conv.aiPaused && (
                        <Badge variant="outline" className="text-[10px]">
                          <Pause className="h-2.5 w-2.5 mr-1" />
                          IA pausada
                        </Badge>
                      )}
                      {c.conv.status === "human_handoff" && (
                        <Badge variant="outline" className="text-[10px]">
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

      <div className="overflow-hidden">
        {selectedId ? (
          <Conversation key={selectedId} convId={selectedId} onChange={() => refetch()} />
        ) : (
          <div className="h-full grid place-items-center text-muted-foreground">
            Selecione uma conversa
          </div>
        )}
      </div>
    </div>
  );
}

function Conversation({ convId, onChange }: { convId: number; onChange: () => void }) {
  const utils = trpc.useUtils();
  const { data } = trpc.conversations.get.useQuery({ id: convId }, { refetchInterval: 4000 });
  const setPause = trpc.conversations.setPause.useMutation({
    onSuccess: () => {
      utils.conversations.get.invalidate({ id: convId });
      onChange();
    },
  });
  const setStatus = trpc.conversations.setStatus.useMutation({
    onSuccess: () => {
      utils.conversations.get.invalidate({ id: convId });
      onChange();
    },
  });
  const sendHuman = trpc.conversations.sendHumanMessage.useMutation({
    onSuccess: () => {
      utils.conversations.get.invalidate({ id: convId });
      setText("");
    },
    onError: e => toast.error(e.message),
  });
  const qualify = trpc.leads.qualify.useMutation({
    onSuccess: () => utils.conversations.get.invalidate({ id: convId }),
  });

  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages?.length]);

  if (!data) return <div className="h-full grid place-items-center text-muted-foreground">Carregando…</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border/60 px-6 py-3 flex items-center justify-between gap-4 bg-background/60">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border">
            <AvatarFallback className="bg-primary/15 text-primary text-xs font-medium">
              {(data.lead?.name ?? data.lead?.phoneNumber ?? "??").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{data.lead?.name ?? data.lead?.phoneNumber}</p>
            <p className="text-xs text-muted-foreground">{data.lead?.phoneNumber}</p>
          </div>
          {data.lead && <TempBadge t={data.lead.temperature} />}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => qualify.mutate({ leadId: data.lead!.id })}
            disabled={qualify.isPending}
          >
            Re-qualificar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPause.mutate({ id: convId, aiPaused: !data.conversation.aiPaused })}
          >
            {data.conversation.aiPaused ? (
              <>
                <Play className="h-3.5 w-3.5 mr-1" />
                Retomar IA
              </>
            ) : (
              <>
                <Pause className="h-3.5 w-3.5 mr-1" />
                Pausar IA (assumir)
              </>
            )}
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

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3 bg-background/30">
        {data.messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center mt-10">
            Sem mensagens nesta conversa.
          </p>
        )}
        {data.messages.map(m => (
          <Bubble key={m.id} m={m} />
        ))}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border/60 p-4 bg-background/60">
        {!data.conversation.aiPaused ? (
          <div className="text-xs text-muted-foreground text-center">
            IA está respondendo automaticamente. Pause para enviar manualmente.
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Digite sua mensagem manual…"
              onKeyDown={e => {
                if (e.key === "Enter" && text.trim()) {
                  sendHuman.mutate({ conversationId: convId, text });
                }
              }}
            />
            <Button
              onClick={() => text.trim() && sendHuman.mutate({ conversationId: convId, text })}
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
  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className={`rounded-2xl px-4 py-2.5 max-w-[75%] text-sm shadow-sm ${
          isOut
            ? sender === "human"
              ? "bg-accent/30 text-foreground rounded-br-sm"
              : "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-card text-card-foreground rounded-bl-sm"
        }`}
      >
        <div className="flex items-center gap-1.5 mb-1 opacity-80 text-[10px] uppercase tracking-wider">
          {sender === "ai" && (
            <>
              <Bot className="h-3 w-3" /> IA
            </>
          )}
          {sender === "human" && (
            <>
              <User className="h-3 w-3" /> Humano
            </>
          )}
          {sender === "lead" && "Lead"}
          {sender === "system" && "Sistema"}
        </div>
        {m.contentType === "text" && (
          <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
        )}
        {m.contentType === "image" && (
          <div className="flex items-center gap-2 italic opacity-90">
            <ImageIcon className="h-3 w-3" /> Imagem enviada
          </div>
        )}
        {m.contentType === "video" && (
          <div className="flex items-center gap-2 italic opacity-90">
            <Video className="h-3 w-3" /> Vídeo enviado
          </div>
        )}
        <p className="text-[9px] mt-1.5 opacity-60">
          {new Date(m.createdAt).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
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
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground">
      —
    </Badge>
  );
}

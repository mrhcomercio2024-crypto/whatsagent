import AppLayout from "@/components/AppLayout";
import { AgentRequired } from "@/components/AgentRequired";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Bot, Image as ImageIcon, RotateCcw, Send, User, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export default function SimulatorPage() {
  return (
    <AppLayout>
      <AgentRequired>{agentId => <Inner agentId={agentId} />}</AgentRequired>
    </AppLayout>
  );
}

function Inner({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const [convId, setConvId] = useState<number | null>(null);
  const [text, setText] = useState("");
  const send = trpc.simulator.sendMessage.useMutation({
    onSuccess: r => {
      setConvId(r.conversationId);
      setText("");
      if (r.conversationId) utils.conversations.get.invalidate({ id: r.conversationId });
    },
    onError: e => toast.error(e.message),
  });
  const reset = trpc.simulator.reset.useMutation({
    onSuccess: () => {
      if (convId) utils.conversations.get.invalidate({ id: convId });
      toast.success("Simulação reiniciada");
    },
  });
  const { data } = trpc.conversations.get.useQuery(
    { id: convId ?? 0 },
    { enabled: !!convId, refetchInterval: 2000 }
  );

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages?.length]);

  function submit() {
    if (!text.trim()) return;
    send.mutate({ agentId, conversationId: convId ?? undefined, text });
  }

  return (
    <div className="container py-10 max-w-3xl">
      <PageHeader
        eyebrow="Teste"
        title="Simulador de conversa"
        description="Converse com o agente exatamente como o WhatsApp faria — sem enviar mensagens reais. Valide cérebro, etapas, gatilhos de mídia e qualificação."
        actions={
          convId ? (
            <Button
              variant="outline"
              onClick={() => reset.mutate({ conversationId: convId })}
              disabled={reset.isPending}
            >
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Reiniciar
            </Button>
          ) : null
        }
      />

      <div className="elevated-card rounded-2xl flex flex-col h-[60vh]">
        <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-background/30 rounded-t-2xl">
          {!data?.messages?.length && (
            <p className="text-sm text-muted-foreground text-center mt-10">
              Envie a primeira mensagem como se fosse o lead.
            </p>
          )}
          {data?.messages?.map(m => {
            const isOut = m.direction === "outbound";
            return (
              <div key={m.id} className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                <div
                  className={`rounded-2xl px-4 py-2.5 max-w-[80%] text-sm shadow-sm ${
                    isOut
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-card text-card-foreground rounded-bl-sm"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1 opacity-80 text-[10px] uppercase tracking-wider">
                    {isOut ? (
                      <>
                        <Bot className="h-3 w-3" /> IA
                      </>
                    ) : (
                      <>
                        <User className="h-3 w-3" /> Lead
                      </>
                    )}
                  </div>
                  {m.contentType === "text" && (
                    <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                  )}
                  {m.contentType === "image" && (
                    <p className="italic opacity-90 flex items-center gap-2">
                      <ImageIcon className="h-3 w-3" /> Imagem (gatilho disparado)
                    </p>
                  )}
                  {m.contentType === "video" && (
                    <p className="italic opacity-90 flex items-center gap-2">
                      <Video className="h-3 w-3" /> Vídeo (gatilho disparado)
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        <div className="border-t border-border/50 p-3 flex items-center gap-2 bg-background/40 rounded-b-2xl">
          <Input
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Envie como se fosse o lead..."
            onKeyDown={e => {
              if (e.key === "Enter") submit();
            }}
          />
          <Button onClick={submit} disabled={send.isPending}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

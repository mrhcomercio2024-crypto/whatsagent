import { ReactNode } from "react";
import { useAgent } from "@/contexts/AgentContext";
import { trpc } from "@/lib/trpc";
import { EmptyState } from "./PageHeader";
import { Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { useLocation } from "wouter";

export function AgentRequired({ children }: { children: (agentId: number) => ReactNode }) {
  const { selectedAgentId } = useAgent();
  const { data: agents, isLoading } = trpc.agents.list.useQuery();
  const [, navigate] = useLocation();

  if (isLoading) {
    return (
      <div className="container py-16">
        <div className="elevated-card rounded-2xl h-40 animate-pulse" />
      </div>
    );
  }

  if (!agents || agents.length === 0) {
    return (
      <div className="container py-16 max-w-2xl">
        <EmptyState
          icon={<Sparkles className="h-5 w-5" />}
          title="Crie seu primeiro agente"
          description="Para usar o WhatsAgent você precisa primeiro criar um agente. Cada agente tem seu próprio cérebro, etapas, mídias e configuração de WhatsApp."
          action={
            <Button onClick={() => navigate("/agents")}>Criar agente</Button>
          }
        />
      </div>
    );
  }

  if (!selectedAgentId) {
    return (
      <div className="container py-16 max-w-2xl">
        <EmptyState
          icon={<Sparkles className="h-5 w-5" />}
          title="Selecione um agente"
          description="Use o seletor no canto superior esquerdo para escolher qual agente você quer configurar."
        />
      </div>
    );
  }

  return <>{children(selectedAgentId)}</>;
}

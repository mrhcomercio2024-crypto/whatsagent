import AppLayout from "@/components/AppLayout";
import { AgentRequired } from "@/components/AgentRequired";
import { PageHeader } from "@/components/PageHeader";
import { trpc } from "@/lib/trpc";
import { Activity, MessageSquare, Flame, Snowflake, Sun, Clock, Bot, Users } from "lucide-react";
import { ReactNode } from "react";

export default function DashboardPage() {
  return (
    <AppLayout>
      <AgentRequired>{agentId => <Inner agentId={agentId} />}</AgentRequired>
    </AppLayout>
  );
}

function Inner({ agentId }: { agentId: number }) {
  const { data: m, isLoading } = trpc.metrics.summary.useQuery({ agentId, daysBack: 30 });

  return (
    <div className="container py-10">
      <PageHeader
        eyebrow="Visão geral"
        title="Dashboard"
        description="Métricas dos últimos 30 dias do agente selecionado."
      />

      {isLoading || !m ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="elevated-card rounded-2xl h-32 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat icon={<Users className="h-4 w-4" />} label="Leads totais" value={m.totalLeads} />
            <Stat
              icon={<Activity className="h-4 w-4" />}
              label="Conversas totais"
              value={m.totalConversations}
            />
            <Stat
              icon={<MessageSquare className="h-4 w-4" />}
              label="Mensagens recebidas"
              value={m.counts["message_received"] ?? 0}
              hint={`${m.counts["message_sent"] ?? 0} enviadas`}
            />
            <Stat
              icon={<Bot className="h-4 w-4" />}
              label="Resp. da IA"
              value={m.counts["ai_reply_sent"] ?? 0}
              hint={`${m.counts["human_reply_sent"] ?? 0} humanas`}
            />
            <Stat
              icon={<Clock className="h-4 w-4" />}
              label="Tempo médio resp."
              value={`${(m.avgResponseTimeMs / 1000).toFixed(1)}s`}
              hint="da IA, do recebido ao enviado"
            />
            <Stat
              icon={<Flame className="h-4 w-4 text-destructive" />}
              label="Leads quentes"
              value={m.temperatures.hot}
            />
            <Stat
              icon={<Sun className="h-4 w-4 text-accent" />}
              label="Leads mornos"
              value={m.temperatures.warm}
            />
            <Stat
              icon={<Snowflake className="h-4 w-4" />}
              label="Leads frios"
              value={m.temperatures.cold}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
            <div className="elevated-card rounded-2xl p-6">
              <h3 className="font-medium mb-4">Operação</h3>
              <div className="grid grid-cols-2 gap-4">
                <Tile
                  label="Handoff humano"
                  value={m.counts["handoff_started"] ?? 0}
                  description="Conversas transferidas para atendimento humano."
                />
                <Tile
                  label="Conversões"
                  value={m.counts["conversion"] ?? 0}
                  description="Marcadas como convertidas."
                />
              </div>
            </div>
            <div className="elevated-card rounded-2xl p-6">
              <h3 className="font-medium mb-4">Follow-ups</h3>
              <div className="grid grid-cols-2 gap-4">
                <Tile label="Disparados" value={m.counts["followup_sent"] ?? 0} />
                <Tile label="Cancelados" value={m.counts["followup_cancelled"] ?? 0} />
              </div>
            </div>
          </div>

          <div className="mt-6 elevated-card rounded-2xl p-6">
            <h3 className="font-medium mb-4">Distribuição de eventos</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Object.entries(m.counts).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-sm bg-background/40 rounded-lg px-3 py-2 border border-border/30">
                  <span className="text-muted-foreground truncate">{k}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
              {Object.keys(m.counts).length === 0 && (
                <p className="text-sm text-muted-foreground col-span-full">
                  Sem eventos registrados ainda.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="elevated-card rounded-2xl p-5">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <p className="text-3xl font-serif mt-3 leading-none">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-2">{hint}</p>}
    </div>
  );
}

function Tile({ label, value, description }: { label: string; value: number; description?: string }) {
  return (
    <div className="rounded-xl bg-background/40 p-4 border border-border/40">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-serif mt-1.5">{value}</p>
      {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
    </div>
  );
}

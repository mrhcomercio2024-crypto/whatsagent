import AppLayout from "@/components/AppLayout";
import { AgentRequired } from "@/components/AgentRequired";
import { PageHeader } from "@/components/PageHeader";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  MessageSquare,
  Flame,
  Snowflake,
  Sun,
  Clock,
  Bot,
  Users,
  Wifi,
  WifiOff,
  RotateCw,
  Gauge,
  AlertTriangle,
} from "lucide-react";
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
  // Saúde do bridge Baileys: refetch a cada 5s para ver atividade em tempo real
  const { data: health } = trpc.qr.health.useQuery(
    { agentId },
    { refetchInterval: 5000 }
  );

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

          <BridgeHealthPanel health={health} />

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

type BridgeHealth = {
  agentId: number;
  connectedSince: number | null;
  uptimeMs: number;
  lastActivityAt: number | null;
  reconnectAttempts: number;
  totalReconnects: number;
  lastReconnectAt: number | null;
  lastBackoffMs: number | null;
  inboundCount: number;
  outboundCount: number;
  outboundFailed: number;
  inboundPerMinute: number;
  outboundPerMinute: number;
  rateLimitedCount: number;
  lastErrorAt: number | null;
  lastErrorMessage: string | null;
  live: boolean;
};

function BridgeHealthPanel({ health }: { health: BridgeHealth | undefined | null }) {
  if (!health) {
    return (
      <div className="mt-6 elevated-card rounded-2xl p-6">
        <h3 className="font-medium mb-1">Saúde do bridge WhatsApp (QR)</h3>
        <p className="text-sm text-muted-foreground">Carregando estatísticas…</p>
      </div>
    );
  }
  const live = health.live;
  const uptimeStr = formatDuration(health.uptimeMs);
  const lastActivityStr = health.lastActivityAt
    ? `${formatRelative(health.lastActivityAt)} atrás`
    : "—";
  return (
    <div className="mt-6 elevated-card rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium">Saúde do bridge WhatsApp (QR)</h3>
        <span
          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
            live
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              : "bg-rose-500/10 text-rose-400 border-rose-500/30"
          }`}
        >
          {live ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {live ? "conectado" : "desconectado"}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <Tile label="Uptime" value={uptimeStr as any} description="desde a última conexão" />
        <Tile
          label="Mensagens / min"
          value={`${health.inboundPerMinute} in / ${health.outboundPerMinute} out` as any}
          description="janela de 60s"
        />
        <Tile
          label="Recebidas (total)"
          value={health.inboundCount}
          description="desde o boot"
        />
        <Tile
          label="Enviadas (total)"
          value={health.outboundCount}
          description={`${health.outboundFailed} falhas`}
        />
        <Tile
          label="Reconnects"
          value={health.totalReconnects}
          description={
            health.reconnectAttempts > 0
              ? `tentativa atual: ${health.reconnectAttempts}`
              : "estabilizado"
          }
        />
        <Tile
          label="Último backoff"
          value={health.lastBackoffMs ? `${(health.lastBackoffMs / 1000).toFixed(1)}s` as any : "—"}
          description={health.lastReconnectAt ? formatRelative(health.lastReconnectAt) + " atrás" : "—"}
        />
        <Tile
          label="Rate limited"
          value={health.rateLimitedCount}
          description="esperas por limite"
        />
        <Tile
          label="Última atividade"
          value={lastActivityStr as any}
          description="in/out"
        />
      </div>
      {health.lastErrorMessage && !live && (
        <div className="mt-4 flex items-start gap-2 p-3 rounded-lg border border-rose-500/30 bg-rose-500/5 text-sm">
          <AlertTriangle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-rose-300 font-medium">Último erro</p>
            <p className="text-muted-foreground">{health.lastErrorMessage}</p>
          </div>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <RotateCw className="h-3 w-3" /> watchdog 60s
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Activity className="h-3 w-3" /> heartbeat 30s
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Gauge className="h-3 w-3" /> 20 envios / minuto máx.
        </span>
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (!ms || ms < 1000) return "—";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${min % 60}m`;
  const d = Math.floor(hr / 24);
  return `${d}d ${hr % 24}h`;
}

function formatRelative(epochMs: number): string {
  const diff = Date.now() - epochMs;
  if (diff < 0) return "agora";
  return formatDuration(diff);
}

function Tile({ label, value, description }: { label: string; value: number | string; description?: string }) {
  return (
    <div className="rounded-xl bg-background/40 p-4 border border-border/40">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-serif mt-1.5">{value}</p>
      {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
    </div>
  );
}

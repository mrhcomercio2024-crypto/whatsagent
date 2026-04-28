import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { AgentRequired } from "@/components/AgentRequired";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  RefreshCcw,
  X,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Ban,
  MessageSquareReply,
  Search,
  User,
} from "lucide-react";
import { toast } from "sonner";

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function fmtPhone(raw: string | null): string {
  if (!raw) return "";
  const digits = raw.replace(/\D+/g, "").replace(/^(\d+):\d+$/, "$1");
  // formato BR aproximado
  if (digits.length >= 12 && digits.length <= 13) {
    const cc = digits.slice(0, 2);
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    const head = rest.slice(0, rest.length - 4);
    const tail = rest.slice(-4);
    return `+${cc} (${ddd}) ${head}-${tail}`;
  }
  return raw;
}

type RetryStatus =
  | "pending"
  | "succeeded"
  | "exhausted"
  | "cancelled"
  | "cancelled_by_reply";

const STATUS_META: Record<
  RetryStatus,
  { label: string; icon: any; tone: string }
> = {
  pending: {
    label: "Pendente",
    icon: Clock,
    tone: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  succeeded: {
    label: "Reenviado",
    icon: CheckCircle2,
    tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  exhausted: {
    label: "Esgotado",
    icon: AlertTriangle,
    tone: "bg-red-500/15 text-red-300 border-red-500/30",
  },
  cancelled: {
    label: "Cancelado",
    icon: Ban,
    tone: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  },
  cancelled_by_reply: {
    label: "Lead respondeu",
    icon: MessageSquareReply,
    tone: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  },
};

function StatusBadge({ status }: { status: RetryStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={`gap-1.5 ${meta.tone}`}>
      <Icon className="size-3" />
      {meta.label}
    </Badge>
  );
}

function fmtDate(d: any): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("pt-BR");
  } catch {
    return String(d);
  }
}

function fmtPayload(p: any): string {
  if (!p) return "—";
  if (p.type === "text") return p.text ?? "(sem texto)";
  if (p.type === "media") return `[mídia #${p.mediaId}]`;
  return JSON.stringify(p);
}

export default function Retries() {
  return (
    <AgentRequired>
      {(agentId) => <RetriesContent agentId={agentId} />}
    </AgentRequired>
  );
}

function RetriesContent({ agentId }: { agentId: number }) {
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search.trim(), 300);

  const status: RetryStatus | undefined =
    tab === "pending" ? "pending" : undefined;

  const list = trpc.messageRetries.list.useQuery(
    {
      agentId,
      status,
      limit: 200,
      search: debouncedSearch || undefined,
    },
    { refetchInterval: 5000 }
  );
  const pending = trpc.messageRetries.countPending.useQuery(
    { agentId },
    { refetchInterval: 5000 }
  );

  const utils = trpc.useUtils();
  const retryNow = trpc.messageRetries.retryNow.useMutation({
    onSuccess: () => {
      toast.success("Reagendado para agora");
      utils.messageRetries.list.invalidate();
      utils.messageRetries.countPending.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const cancel = trpc.messageRetries.cancel.useMutation({
    onSuccess: () => {
      toast.success("Cancelado");
      utils.messageRetries.list.invalidate();
      utils.messageRetries.countPending.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = (list.data ?? []) as any[];

  return (
    <div className="container py-8 space-y-6">
      <PageHeader
        title="Reenvios"
        description="Mensagens que falharam no envio são reagendadas automaticamente com backoff exponencial (30s → 2min → 5min → 15min → 30min). Quando o lead responder, os reenvios pendentes são cancelados."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Reenvios pendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{pending.data?.count ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="sm:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Como funciona
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Toda vez que um envio para o WhatsApp falha (timeout de 20s, socket
            caído ou erro do Meta), a mensagem entra na fila de reenvios. Um
            worker tenta de novo em intervalos crescentes, até 5 tentativas. Se
            o lead responder no meio, o reenvio é cancelado para não atrapalhar
            a conversa.
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="pending">Pendentes</TabsTrigger>
            <TabsTrigger value="all">Todos (últimos 200)</TabsTrigger>
          </TabsList>
          <div className="relative w-full sm:w-80">
            <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              type="search"
              placeholder="Buscar por nome ou telefone do lead"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        <TabsContent value={tab} className="mt-4">
          <Card>
            <CardContent className="p-0">
              {list.isLoading ? (
                <div className="p-8 text-center text-muted-foreground">
                  Carregando…
                </div>
              ) : rows.length === 0 ? (
                <EmptyState
                  icon={
                    debouncedSearch ? (
                      <Search className="size-5" />
                    ) : (
                      <CheckCircle2 className="size-5" />
                    )
                  }
                  title={
                    debouncedSearch
                      ? "Nenhum reenvio encontrado"
                      : tab === "pending"
                        ? "Nenhum reenvio pendente"
                        : "Sem reenvios registrados"
                  }
                  description={
                    debouncedSearch
                      ? `Nenhum lead com “${debouncedSearch}” nos reenvios ${
                          tab === "pending" ? "pendentes" : "recentes"
                        }.`
                      : tab === "pending"
                        ? "Tudo em ordem — todas as mensagens estão sendo entregues."
                        : "Quando uma mensagem falhar, ela aparece aqui."
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-left text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Lead</th>
                        <th className="px-4 py-3 font-medium">Conteúdo</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Tentativas</th>
                        <th className="px-4 py-3 font-medium">Próx. envio</th>
                        <th className="px-4 py-3 font-medium">Erro</th>
                        <th className="px-4 py-3 font-medium text-right">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((r) => (
                        <tr key={r.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 align-top whitespace-nowrap">
                            <div className="flex items-start gap-2">
                              <User className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <div className="font-medium truncate max-w-[180px]">
                                  {r.leadName || (
                                    <span className="text-muted-foreground italic">
                                      Sem nome
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                                  {fmtPhone(r.leadPhone) ||
                                    `Conversa #${r.conversationId}`}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top max-w-[360px]">
                            <div className="line-clamp-2 break-words">
                              {fmtPayload(r.payload)}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <StatusBadge status={r.status as RetryStatus} />
                          </td>
                          <td className="px-4 py-3 align-top whitespace-nowrap">
                            {r.attempt}/{r.maxAttempts}
                          </td>
                          <td className="px-4 py-3 align-top whitespace-nowrap text-muted-foreground">
                            {r.status === "pending"
                              ? fmtDate(r.nextRetryAt)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 align-top max-w-[280px]">
                            {r.lastError ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-red-300 line-clamp-1 cursor-help">
                                      {r.lastError}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-md break-words">
                                    {r.lastError}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                            {(r.status === "pending" ||
                              r.status === "exhausted") && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="mr-2"
                                  disabled={retryNow.isPending}
                                  onClick={() =>
                                    retryNow.mutate({
                                      id: r.id,
                                      agentId,
                                    })
                                  }
                                >
                                  <RefreshCcw className="size-3.5 mr-1" />
                                  Reenviar agora
                                </Button>
                                {r.status === "pending" && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={cancel.isPending}
                                    onClick={() =>
                                      cancel.mutate({
                                        id: r.id,
                                        agentId,
                                      })
                                    }
                                  >
                                    <X className="size-3.5 mr-1" />
                                    Cancelar
                                  </Button>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

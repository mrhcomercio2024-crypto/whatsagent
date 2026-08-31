import AppLayout from "@/components/AppLayout";
import { AgentRequired } from "@/components/AgentRequired";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  Copy,
  Instagram as InstagramIcon,
  Link2,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Unplug,
  UserRound,
  Webhook,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type ConversationStatus = "all" | "open" | "human_handoff" | "closed" | "archived";
type Temperature = "all" | "hot" | "warm" | "cold" | "unknown";
type Automation = "all" | "ai" | "handoff";

function dateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function relativeTime(value: Date | string | null | undefined) {
  if (!value) return "Sem atividade";
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(delta / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

function connectionTone(connected: boolean, webhookStatus: string, tokenStatus: string) {
  if (connected && webhookStatus === "subscribed" && tokenStatus === "valid") {
    return { label: "Conectado", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" };
  }
  if (tokenStatus === "expired" || tokenStatus === "revoked" || webhookStatus === "error") {
    return { label: "Requer atenção", className: "bg-red-500/15 text-red-300 border-red-500/30" };
  }
  return { label: "Não conectado", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" };
}

export default function InstagramPage() {
  return (
    <AppLayout>
      <AgentRequired>{agentId => <InstagramInner agentId={agentId} />}</AgentRequired>
    </AppLayout>
  );
}

function InstagramInner({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ConversationStatus>("all");
  const [temperature, setTemperature] = useState<Temperature>("all");
  const [automation, setAutomation] = useState<Automation>("all");
  const [tag, setTag] = useState("");
  const [minScore, setMinScore] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [humanText, setHumanText] = useState("");

  const inboxInput = useMemo(
    () => ({
      agentId,
      limit: 200,
      status: statusFilter === "all" ? undefined : statusFilter,
      temperature: temperature === "all" ? undefined : temperature,
      search: search.trim() || undefined,
      tag: tag.trim() || undefined,
      handoff: automation === "all" ? undefined : automation === "handoff",
      unread: unreadOnly || undefined,
      minLeadScore: minScore ? Math.max(0, Math.min(100, Number(minScore))) : undefined,
    }),
    [agentId, automation, minScore, search, statusFilter, tag, temperature, unreadOnly],
  );

  const status = trpc.instagram.status.useQuery({ agentId });
  const pendingAssets = trpc.instagram.pendingAssets.useQuery({ agentId });
  const metrics = trpc.instagram.metrics.useQuery({ agentId, days: 30 });
  const logs = trpc.instagram.logs.useQuery({ agentId, limit: 50 });
  const inbox = trpc.instagram.inbox.useQuery(inboxInput, { refetchInterval: 15_000 });
  const detail = trpc.instagram.conversation.useQuery(
    { agentId, conversationId: selectedId ?? 1 },
    { enabled: selectedId != null, refetchInterval: 10_000 },
  );

  useEffect(() => {
    if (!selectedId && inbox.data?.[0]) setSelectedId(inbox.data[0].conversation.id);
  }, [inbox.data, selectedId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("instagram");
    if (result === "connected") {
      toast.success("Conta Instagram conectada via Facebook e Webhook inscrito.");
      status.refetch();
    } else if (result === "select") {
      toast.info("Selecione abaixo a Página e a conta Instagram autorizadas.");
      pendingAssets.refetch();
    } else if (result === "error") {
      toast.error(`Não foi possível conectar: ${params.get("code") || "erro OAuth"}`);
    }
  }, []);

  const invalidateAll = async () => {
    await Promise.all([
      utils.instagram.status.invalidate({ agentId }),
      utils.instagram.pendingAssets.invalidate({ agentId }),
      utils.instagram.metrics.invalidate({ agentId, days: 30 }),
      utils.instagram.logs.invalidate({ agentId, limit: 50 }),
      utils.instagram.inbox.invalidate(),
    ]);
    if (selectedId) await utils.instagram.conversation.invalidate({ agentId, conversationId: selectedId });
  };

  const connect = trpc.instagram.connectUrl.useMutation({
    onSuccess: data => window.location.assign(data.url),
    onError: error => toast.error(error.message),
  });
  const health = trpc.instagram.healthCheck.useMutation({
    onSuccess: async () => {
      toast.success("Integração validada diretamente na Meta.");
      await invalidateAll();
    },
    onError: error => toast.error(error.message),
  });
  const selectAsset = trpc.instagram.selectAsset.useMutation({
    onSuccess: async () => {
      toast.success("Página e conta Instagram conectadas.");
      await invalidateAll();
    },
    onError: error => toast.error(error.message),
  });
  const disconnect = trpc.instagram.disconnect.useMutation({
    onSuccess: async () => {
      toast.success("Instagram desconectado. Dados e histórico foram preservados.");
      await invalidateAll();
    },
  });
  const handoff = trpc.instagram.setHandoff.useMutation({
    onSuccess: async (_, variables) => {
      toast.success(variables.assumed ? "Conversa assumida pelo operador." : "Conversa devolvida ao Ravi.");
      await invalidateAll();
    },
    onError: error => toast.error(error.message),
  });
  const sendHuman = trpc.instagram.sendHumanMessage.useMutation({
    onSuccess: async () => {
      setHumanText("");
      await invalidateAll();
    },
    onError: error => toast.error(error.message),
  });

  const connection = connectionTone(
    status.data?.connected ?? false,
    status.data?.webhookStatus ?? "pending",
    status.data?.tokenStatus ?? "missing",
  );

  return (
    <div className="container max-w-[1680px] py-8 space-y-6">
      <PageHeader
        eyebrow="Operação"
        title="Instagram"
        description="Conecte o Direct oficial da Meta ao mesmo Ravi, CRM e histórico já usados nos outros canais."
      />

      <section className="elevated-card rounded-2xl p-5 space-y-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <div className="size-12 rounded-2xl bg-gradient-to-br from-fuchsia-500/20 via-pink-500/20 to-amber-400/20 grid place-items-center border border-pink-500/20">
              <InstagramIcon className="size-6 text-pink-300" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-semibold">Instagram API oficial</h2>
                <Badge variant="outline" className={connection.className}>{connection.label}</Badge>
              </div>
              <p className="text-sm text-muted-foreground truncate">
                {status.data?.username ? `@${status.data.username}` : "Nenhuma conta profissional conectada"}
                {status.data?.accountId ? ` · ID ${status.data.accountId}` : ""}
              </p>
              {status.data?.facebookPageName && (
                <p className="text-xs text-muted-foreground truncate">
                  Página: {status.data.facebookPageName}
                  {status.data.facebookPageId ? ` · ${status.data.facebookPageId}` : ""}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => connect.mutate({ agentId })}
              disabled={connect.isPending}
              className="bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500"
            >
              {connect.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Link2 className="size-4 mr-2" />}
              {status.data?.connected ? "RECONECTAR VIA FACEBOOK" : "CONECTAR VIA FACEBOOK"}
            </Button>
            <Button variant="outline" onClick={() => health.mutate({ agentId })} disabled={!status.data?.connected || health.isPending}>
              {health.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <RefreshCw className="size-4 mr-2" />}
              TESTAR INTEGRAÇÃO
            </Button>
            {status.data?.connected && (
              <Button
                variant="outline"
                onClick={() => window.confirm("Desconectar o Instagram? O histórico será preservado.") && disconnect.mutate({ agentId })}
                disabled={disconnect.isPending}
              >
                <Unplug className="size-4 mr-2" /> Desconectar
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <StatusItem icon={ShieldCheck} label="Token" value={status.data?.tokenStatus ?? "missing"} detail={dateTime(status.data?.tokenExpiresAt)} />
          <StatusItem icon={Webhook} label="Webhook" value={status.data?.webhookStatus ?? "pending"} detail={dateTime(status.data?.lastWebhookAt)} />
          <StatusItem icon={MessageCircle} label="Última inbound" value={relativeTime(status.data?.lastInboundAt)} detail={dateTime(status.data?.lastInboundAt)} />
          <StatusItem icon={Send} label="Última outbound" value={relativeTime(status.data?.lastOutboundAt)} detail={dateTime(status.data?.lastOutboundAt)} />
          <StatusItem icon={Clock3} label="App Meta" value={status.data?.metaAppId ?? "2533423037090142"} detail="Graph API v26.0" />
          <StatusItem icon={Link2} label="Autorização" value="Facebook Business" detail={status.data?.facebookPageName ?? "Página ainda não selecionada"} />
        </div>

        {pendingAssets.data && pendingAssets.data.length > 0 && (
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-blue-100">Selecione a conta profissional</p>
              <p className="text-xs text-blue-100/70">
                O Facebook autorizou mais de uma Página com Instagram vinculado. Os tokens permanecem cifrados no servidor.
              </p>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {pendingAssets.data.map(asset => (
                <button
                  key={`${asset.pageId}:${asset.instagramAccountId}`}
                  type="button"
                  onClick={() =>
                    selectAsset.mutate({
                      agentId,
                      pageId: asset.pageId,
                      instagramAccountId: asset.instagramAccountId,
                    })
                  }
                  disabled={selectAsset.isPending}
                  className="rounded-xl border border-border/60 bg-background/40 p-3 text-left hover:border-blue-400/50 disabled:opacity-50"
                >
                  <p className="text-sm font-medium">
                    {asset.instagramUsername ? `@${asset.instagramUsername}` : asset.instagramName || asset.instagramAccountId}
                  </p>
                  <p className="text-xs text-muted-foreground">Página: {asset.pageName}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {status.data?.lastError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 flex gap-3">
            <AlertTriangle className="size-5 text-red-300 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-red-200">Último erro da integração</p>
              <p className="text-xs text-red-100/70 break-words">{status.data.lastErrorCode ? `[${status.data.lastErrorCode}] ` : ""}{status.data.lastError}</p>
            </div>
          </div>
        )}

        <div className="grid gap-2 md:grid-cols-2">
          <CopyField label="Callback Webhook" value={status.data?.callbackUrl ?? "https://agentedozap.com/webhooks/meta/instagram"} />
          <CopyField label="OAuth Redirect URI" value={status.data?.oauthRedirectUri ?? "https://agentedozap.com/api/instagram/oauth/callback"} />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Metric label="Recebidas" value={metrics.data?.received ?? 0} />
        <Metric label="Enviadas" value={metrics.data?.sent ?? 0} />
        <Metric label="Conversas" value={metrics.data?.conversations ?? 0} />
        <Metric label="Leads qualificados" value={metrics.data?.qualifiedLeads ?? 0} />
        <Metric label="Leads quentes" value={metrics.data?.hotLeads ?? 0} />
        <Metric label="Handoff" value={metrics.data?.handoff ?? 0} />
        <Metric label="Falhas" value={metrics.data?.failed ?? 0} tone="red" />
        <Metric label="Webhook falhou" value={metrics.data?.webhookFailures ?? 0} tone="amber" />
        <Metric label="Resposta média" value={metrics.data?.averageResponseMs == null ? "—" : `${(metrics.data.averageResponseMs / 1000).toFixed(1)}s`} />
        <Metric label="Conversões" value={metrics.data?.conversions ?? 0} />
        <Metric label="Receita atribuída" value={metrics.data?.revenueCents == null ? "—" : (metrics.data.revenueCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} />
      </section>

      <section className="elevated-card rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium"><Search className="size-4 text-muted-foreground" /> Filtros do inbox</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome ou @username" className="xl:col-span-2" />
          <Input value={tag} onChange={event => setTag(event.target.value)} placeholder="Tag" />
          <Input value={minScore} onChange={event => setMinScore(event.target.value.replace(/\D/g, ""))} placeholder="Score mínimo" inputMode="numeric" />
          <FilterSelect value={statusFilter} onValueChange={value => setStatusFilter(value as ConversationStatus)} items={[['all','Todos status'],['open','Aberta'],['human_handoff','Handoff'],['closed','Fechada'],['archived','Arquivada']]} />
          <FilterSelect value={temperature} onValueChange={value => setTemperature(value as Temperature)} items={[['all','Temperatura'],['hot','Quente'],['warm','Morno'],['cold','Frio'],['unknown','Sem classificação']]} />
          <FilterSelect value={automation} onValueChange={value => setAutomation(value as Automation)} items={[['all','IA + humano'],['ai','Com Ravi'],['handoff','Em handoff']]} />
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={unreadOnly} onChange={event => setUnreadOnly(event.target.checked)} className="accent-emerald-500" />
          Somente conversas com inbound mais recente que a última resposta
        </label>
      </section>

      <section className="grid min-h-[720px] overflow-hidden rounded-2xl border border-border/60 bg-card/30 lg:grid-cols-[320px_minmax(0,1fr)_300px]">
        <aside className="border-b border-border/60 lg:border-b-0 lg:border-r overflow-y-auto max-h-[360px] lg:max-h-none">
          <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
            <h3 className="font-medium">Conversas</h3>
            <Badge variant="secondary">{inbox.data?.length ?? 0}</Badge>
          </div>
          {inbox.isLoading && <LoadingBlock label="Carregando conversas" />}
          {!inbox.isLoading && inbox.data?.length === 0 && <EmptyBlock label="Nenhuma conversa Instagram encontrada." />}
          <div className="divide-y divide-border/50">
            {inbox.data?.map(item => {
              const active = item.conversation.id === selectedId;
              const name = item.identity.displayName || item.lead.name || item.identity.username || "Lead Instagram";
              return (
                <button
                  key={item.conversation.id}
                  onClick={() => setSelectedId(item.conversation.id)}
                  className={`w-full p-4 text-left transition-colors ${active ? "bg-pink-500/10" : "hover:bg-muted/40"}`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar src={item.identity.profilePictureUrl} name={name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate">{name}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{relativeTime(item.conversation.lastMessageAt)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{item.identity.username ? `@${item.identity.username}` : `IGSID ${item.identity.externalUserId.slice(-6)}`}</p>
                      <div className="flex items-center gap-1 mt-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{item.lead.temperature}</Badge>
                        {item.conversation.aiPaused && <Badge className="text-[10px] bg-amber-500/15 text-amber-300">Humano</Badge>}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0 flex flex-col min-h-[620px] lg:min-h-0">
          {!selectedId && <EmptyBlock label="Selecione uma conversa para abrir o histórico." />}
          {selectedId && detail.isLoading && <LoadingBlock label="Abrindo conversa" />}
          {detail.data && (
            <>
              <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{detail.data.identity.displayName || detail.data.lead.name || "Lead Instagram"}</p>
                  <p className="text-xs text-muted-foreground truncate">{detail.data.identity.username ? `@${detail.data.identity.username}` : detail.data.identity.externalUserId}</p>
                </div>
                <Button
                  size="sm"
                  variant={detail.data.conversation.aiPaused ? "outline" : "default"}
                  onClick={() => handoff.mutate({ agentId, conversationId: detail.data!.conversation.id, assumed: !detail.data!.conversation.aiPaused })}
                  disabled={handoff.isPending}
                >
                  {detail.data.conversation.aiPaused ? <Bot className="size-4 mr-2" /> : <UserRound className="size-4 mr-2" />}
                  {detail.data.conversation.aiPaused ? "DEVOLVER PARA O RAVI" : "ASSUMIR CONVERSA"}
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 bg-[radial-gradient(circle_at_top_left,rgba(236,72,153,0.04),transparent_42%)]">
                {detail.data.messages.map(message => (
                  <MessageBubble key={message.id} message={message} />
                ))}
              </div>
              <div className="border-t border-border/60 p-3">
                {detail.data.conversation.aiPaused ? (
                  <div className="flex gap-2">
                    <Input
                      value={humanText}
                      onChange={event => setHumanText(event.target.value)}
                      placeholder="Responder como operador"
                      onKeyDown={event => {
                        if (event.key === "Enter" && humanText.trim() && !sendHuman.isPending) {
                          sendHuman.mutate({ agentId, conversationId: detail.data!.conversation.id, text: humanText.trim() });
                        }
                      }}
                    />
                    <Button
                      onClick={() => humanText.trim() && sendHuman.mutate({ agentId, conversationId: detail.data!.conversation.id, text: humanText.trim() })}
                      disabled={!humanText.trim() || sendHuman.isPending}
                    >
                      {sendHuman.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-center text-muted-foreground py-2">Ravi responde automaticamente. Assuma a conversa para enviar manualmente.</p>
                )}
              </div>
            </>
          )}
        </main>

        <aside className="border-t border-border/60 lg:border-t-0 lg:border-l p-4 space-y-5 overflow-y-auto">
          <h3 className="font-medium">Dados do lead</h3>
          {detail.data ? (
            <>
              <LeadField label="Nome" value={detail.data.lead.name || detail.data.identity.displayName || "—"} />
              <LeadField label="Instagram" value={detail.data.identity.username ? `@${detail.data.identity.username}` : "—"} />
              <LeadField label="IGSID" value={detail.data.identity.externalUserId} mono />
              <LeadField label="Email" value={detail.data.lead.email || "—"} />
              <LeadField label="Telefone" value={(detail.data.lead.customFields as any)?.publicSimulatorPhone || "Não informado"} />
              <LeadField label="Temperatura" value={detail.data.lead.temperature} />
              <LeadField label="Lead score" value={String((detail.data.lead.facts as any)?.leadScore ?? "Sem score")} />
              <LeadField label="Tags" value={detail.data.lead.tags || "—"} />
              <LeadField label="Qualificação" value={detail.data.lead.qualificationNotes || "—"} />
              <LeadField label="Etapa atual" value={detail.data.conversation.currentStepId ? `#${detail.data.conversation.currentStepId}` : "—"} />
              <LeadField label="Última mensagem" value={dateTime(detail.data.conversation.lastMessageAt)} />
              <LeadField label="Status" value={detail.data.conversation.aiPaused ? "Em atendimento humano" : detail.data.conversation.status} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Selecione uma conversa.</p>
          )}
        </aside>
      </section>

      <section className="elevated-card rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border/60">
          <h3 className="font-medium">Logs estruturados da integração</h3>
          <p className="text-xs text-muted-foreground">Sem tokens, App Secret ou Verify Token.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/30">
              <tr><th className="text-left px-4 py-3">Data</th><th className="text-left px-4 py-3">Evento</th><th className="text-left px-4 py-3">Nível</th><th className="text-left px-4 py-3">Detalhe</th></tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {logs.data?.map(log => (
                <tr key={log.id}><td className="px-4 py-3 whitespace-nowrap">{dateTime(log.createdAt)}</td><td className="px-4 py-3 font-mono text-xs">{log.eventType}</td><td className="px-4 py-3">{log.level}</td><td className="px-4 py-3 text-muted-foreground max-w-xl truncate">{log.message || "—"}</td></tr>
              ))}
              {!logs.isLoading && logs.data?.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Nenhum evento Instagram registrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatusItem({ icon: Icon, label, value, detail }: { icon: typeof ShieldCheck; label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-border/60 bg-muted/20 p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-3.5" /> {label}</div><p className="text-sm font-medium mt-2 truncate">{value}</p><p className="text-[10px] text-muted-foreground truncate">{detail}</p></div>;
}

function Metric({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "red" | "amber" }) {
  const color = tone === "red" ? "text-red-300" : tone === "amber" ? "text-amber-300" : "text-foreground";
  return <div className="elevated-card rounded-xl p-4"><p className="text-xs text-muted-foreground">{label}</p><p className={`text-2xl font-semibold mt-1 ${color}`}>{value}</p></div>;
}

function CopyField({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground mb-1.5">{label}</p><div className="flex gap-2"><Input readOnly value={value} className="font-mono text-xs" /><Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(value); toast.success("Copiado"); }}><Copy className="size-4" /></Button></div></div>;
}

function FilterSelect({ value, onValueChange, items }: { value: string; onValueChange: (value: string) => void; items: Array<[string, string]> }) {
  return <Select value={value} onValueChange={onValueChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{items.map(([itemValue, label]) => <SelectItem key={itemValue} value={itemValue}>{label}</SelectItem>)}</SelectContent></Select>;
}

function Avatar({ src, name }: { src: string | null; name: string }) {
  if (src) return <img src={src} alt="" className="size-10 rounded-full object-cover border border-border/60" />;
  return <div className="size-10 rounded-full bg-pink-500/10 text-pink-300 grid place-items-center text-sm font-semibold border border-pink-500/20">{name.slice(0, 1).toUpperCase()}</div>;
}

function MessageBubble({ message }: { message: any }) {
  const outbound = message.direction === "outbound";
  return <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 shadow-sm ${outbound ? "bg-emerald-600/80 text-white rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}><p className="text-sm whitespace-pre-wrap break-words">{message.body || `[${message.contentType}]`}</p><div className={`mt-1 text-[10px] flex justify-end gap-1 ${outbound ? "text-white/65" : "text-muted-foreground"}`}><span>{message.sender}</span><span>·</span><span>{new Date(message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>{message.providerStatus === "failed" && <span className="text-red-200">· falhou</span>}</div></div></div>;
}

function LeadField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className={`text-sm mt-1 break-words ${mono ? "font-mono text-xs" : ""}`}>{value}</p></div>;
}

function LoadingBlock({ label }: { label: string }) {
  return <div className="flex-1 grid place-items-center min-h-40 text-muted-foreground text-sm"><span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> {label}</span></div>;
}

function EmptyBlock({ label }: { label: string }) {
  return <div className="flex-1 grid place-items-center min-h-40 p-6 text-center text-muted-foreground text-sm">{label}</div>;
}

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { BellRing, CheckCircle2, Clock3, CreditCard, Loader2, MousePointerClick, RotateCcw, Save, Send, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function PublicSimulatorRecovery({ agentId }: { agentId: number }) {
  const dashboard = trpc.publicSimulatorAdmin.recoveryDashboard.useQuery({ agentId }, { refetchInterval: 30_000 });
  const rules = trpc.publicSimulatorAdmin.recoveryRules.useQuery({ agentId });
  const jobs = trpc.publicSimulatorAdmin.recoveryJobs.useQuery({ agentId, limit: 200 });
  const subscriptions = trpc.publicSimulatorAdmin.pushSubscriptions.useQuery({ agentId, limit: 200 });
  const totals = dashboard.data?.totals;

  if (dashboard.isLoading || rules.isLoading) {
    return <div className="grid min-h-64 place-items-center"><Loader2 className="size-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Subscriptions ativas" value={totals?.activeSubscriptions || 0} icon={BellRing} />
        <Metric label="Pushes enviados" value={totals?.sent || 0} icon={Send} />
        <Metric label="Cliques" value={totals?.clicked || 0} icon={MousePointerClick} />
        <Metric label="Retornos" value={totals?.returned || 0} icon={RotateCcw} />
        <Metric label="Checkout pós-push" value={totals?.checkout || 0} icon={CreditCard} />
        <Metric label="Compras recuperadas" value={totals?.purchases || 0} icon={CheckCircle2} />
        <Metric label="Receita recuperada" value={currency(totals?.revenueCents || 0)} icon={CreditCard} />
        <Metric label="Endpoints inativos" value={totals?.inactiveSubscriptions || 0} icon={UsersRound} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Receita recuperada por cadência</CardTitle>
          <CardDescription>Atribuição individual do push de 30 minutos, 4 horas e 24 horas.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-y bg-muted/30 text-left text-xs text-muted-foreground">
                <tr><th className="px-5 py-3">Regra</th><th className="px-3 py-3">Enviados</th><th className="px-3 py-3">Cliques</th><th className="px-3 py-3">Retornos</th><th className="px-3 py-3">Checkout</th><th className="px-3 py-3">Compras</th><th className="px-5 py-3 text-right">Receita</th></tr>
              </thead>
              <tbody className="divide-y">
                {(dashboard.data?.byRule || []).map(row => (
                  <tr key={row.ruleId}>
                    <td className="px-5 py-4"><div className="font-medium">{row.name}</div><div className="text-xs text-muted-foreground">{delayLabel(row.delayMinutes)} · {row.channel}</div></td>
                    <td className="px-3 py-4">{row.sent}</td><td className="px-3 py-4">{row.clicked}</td><td className="px-3 py-4">{row.returned}</td><td className="px-3 py-4">{row.checkout}</td><td className="px-3 py-4">{row.purchases}</td><td className="px-5 py-4 text-right font-semibold">{currency(row.revenueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div><h2 className="text-xl font-semibold">Regras de recuperação</h2><p className="text-sm text-muted-foreground">O motor é multicanal; somente Web Push está ativo nesta primeira versão.</p></div>
        <div className="grid gap-4 xl:grid-cols-3">
          {(rules.data || []).map(rule => <RuleCard key={rule.id} agentId={agentId} rule={rule} />)}
        </div>
      </section>

      <Card>
        <CardHeader><CardTitle>Fila de follow-ups</CardTitle><CardDescription>Últimos 200 jobs com push_id, regra, horário e status.</CardDescription></CardHeader>
        <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="border-y bg-muted/30 text-left text-xs text-muted-foreground"><tr><th className="px-5 py-3">Visitante</th><th className="px-3 py-3">Regra</th><th className="px-3 py-3">Push ID</th><th className="px-3 py-3">Agendado</th><th className="px-3 py-3">Enviado</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y">{(jobs.data || []).map(row => <tr key={row.job.id}><td className="px-5 py-4">{row.visitorName || `Visitante ${row.visitorPublicId.slice(0, 6)}`}</td><td className="px-3 py-4">{row.ruleName}</td><td className="px-3 py-4 font-mono text-xs">{row.job.pushId.slice(0, 12)}…</td><td className="px-3 py-4">{dateTime(row.job.scheduledAt)}</td><td className="px-3 py-4">{row.job.sentAt ? dateTime(row.job.sentAt) : "—"}</td><td className="px-5 py-4"><Status status={row.job.status} /></td></tr>)}</tbody></table></div></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Subscriptions</CardTitle><CardDescription>Somente metadados operacionais. Endpoint, p256dh e auth permanecem cifrados e nunca aparecem neste painel.</CardDescription></CardHeader>
        <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead className="border-y bg-muted/30 text-left text-xs text-muted-foreground"><tr><th className="px-5 py-3">Visitante</th><th className="px-3 py-3">Dispositivo</th><th className="px-3 py-3">Navegador</th><th className="px-3 py-3">Último push</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y">{(subscriptions.data || []).map(item => <tr key={item.id}><td className="px-5 py-4">{item.visitorName || `Visitante ${item.visitorPublicId.slice(0, 6)}`}</td><td className="px-3 py-4">{item.device || "—"}</td><td className="px-3 py-4">{item.browser || "—"}</td><td className="px-3 py-4">{item.lastPushAt ? dateTime(item.lastPushAt) : "—"}</td><td className="px-5 py-4"><Status status={item.active ? "active" : item.invalidatedAt ? "invalid" : "revoked"} /></td></tr>)}</tbody></table></div></CardContent>
      </Card>
    </div>
  );
}

function RuleCard({ agentId, rule }: { agentId: number; rule: any }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({ name: rule.name, delayMinutes: rule.delayMinutes, minLeadScore: rule.minLeadScore, messageTemplate: rule.messageTemplate, aiPersonalizationEnabled: rule.aiPersonalizationEnabled, isActive: rule.isActive });
  useEffect(() => setForm({ name: rule.name, delayMinutes: rule.delayMinutes, minLeadScore: rule.minLeadScore, messageTemplate: rule.messageTemplate, aiPersonalizationEnabled: rule.aiPersonalizationEnabled, isActive: rule.isActive }), [rule]);
  const update = trpc.publicSimulatorAdmin.updateRecoveryRule.useMutation({ onSuccess: async () => { await Promise.all([utils.publicSimulatorAdmin.recoveryRules.invalidate({ agentId }), utils.publicSimulatorAdmin.recoveryDashboard.invalidate({ agentId })]); toast.success("Regra atualizada"); }, onError: error => toast.error(error.message) });
  return <Card><CardHeader className="space-y-3"><div className="flex items-start justify-between gap-3"><div><Badge variant="outline">{delayLabel(form.delayMinutes)}</Badge><CardTitle className="mt-2 text-base">{form.name}</CardTitle></div><Switch checked={form.isActive} onCheckedChange={isActive => setForm(previous => ({ ...previous, isActive }))} /></div><CardDescription>Canal: {rule.channel} · ordem {rule.sequenceOrder}</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-2 gap-3"><Field label="Delay (min)"><Input type="number" value={form.delayMinutes} onChange={event => setForm(previous => ({ ...previous, delayMinutes: Number(event.target.value) }))} /></Field><Field label="Score mínimo"><Input type="number" min={0} max={100} value={form.minLeadScore} onChange={event => setForm(previous => ({ ...previous, minLeadScore: Number(event.target.value) }))} /></Field></div><Field label="Mensagem"><Textarea rows={4} value={form.messageTemplate} onChange={event => setForm(previous => ({ ...previous, messageTemplate: event.target.value }))} /></Field><div className="flex items-center justify-between rounded-lg border p-3"><div><p className="text-sm font-medium">Personalizar com IA</p><p className="text-xs text-muted-foreground">Fallback sempre usa o texto fixo.</p></div><Switch checked={form.aiPersonalizationEnabled} onCheckedChange={aiPersonalizationEnabled => setForm(previous => ({ ...previous, aiPersonalizationEnabled }))} /></div><Button className="w-full" onClick={() => update.mutate({ agentId, id: rule.id, patch: form })} disabled={update.isPending}>{update.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}Salvar regra</Button></CardContent></Card>;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) { return <Card><CardContent className="flex items-center gap-3 p-4"><div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></div><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p></div></CardContent></Card>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><Label className="mb-1.5 block text-xs">{label}</Label>{children}</div>; }
function Status({ status }: { status: string }) { const active = ["sent", "active"].includes(status); return <Badge variant={active ? "default" : status === "pending" ? "secondary" : "outline"}>{status}</Badge>; }
function currency(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }
function dateTime(value: Date | string) { return new Date(value).toLocaleString("pt-BR"); }
function delayLabel(minutes: number) { if (minutes < 60) return `${minutes} min`; if (minutes % 1440 === 0) return `${minutes / 1440} dia`; if (minutes % 60 === 0) return `${minutes / 60}h`; return `${Math.floor(minutes / 60)}h ${minutes % 60}min`; }

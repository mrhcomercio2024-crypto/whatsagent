import AppLayout from "@/components/AppLayout";
import { AgentRequired } from "@/components/AgentRequired";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useMemo, useState } from "react";
import {
  DollarSign,
  Coins,
  Users,
  Activity,
  Zap,
  Plus,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

const microToUsd = (m: number) => m / 1_000_000;
const fmtUsd = (m: number) =>
  microToUsd(m).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: m < 10_000 ? 4 : 2,
    maximumFractionDigits: 4,
  });

const PURPOSE_LABEL: Record<string, string> = {
  orchestrator: "Atendimento",
  qualifier: "Qualificação",
  followup: "Follow-up",
  simulator: "Simulador",
  other: "Outro",
};

export default function CostsPage() {
  return (
    <AppLayout>
      <AgentRequired>{agentId => <Inner agentId={agentId} />}</AgentRequired>
    </AppLayout>
  );
}

const PAGE_SIZE = 25;

function Inner({ agentId }: { agentId: number }) {
  const [daysBack, setDaysBack] = useState<number>(30);
  const [scope, setScope] = useState<"agent" | "all">("agent");
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [page, setPage] = useState<number>(0);

  const queryAgentId = scope === "agent" ? agentId : undefined;
  const modelArg = modelFilter === "all" ? undefined : modelFilter;
  const summaryQ = trpc.costs.summary.useQuery({
    agentId: queryAgentId,
    daysBack,
    model: modelArg,
  });
  const byLeadQ = trpc.costs.byLead.useQuery({
    agentId: queryAgentId,
    daysBack,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    model: modelArg,
  });
  const extrasQ = trpc.costs.extras.list.useQuery({ agentId: queryAgentId });

  const m = summaryQ.data;
  const totalExtraMicro = useMemo(() => {
    if (!extrasQ.data) return 0;
    return extrasQ.data.reduce((acc, e) => acc + (e.amountMicroUsd || 0), 0);
  }, [extrasQ.data]);

  return (
    <div className="container py-10 space-y-8">
      <PageHeader
        eyebrow="Financeiro"
        title="Custos"
        description="Gasto da IA por agente e por lead, com tabela de preços editável e custos extras manuais."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={scope} onValueChange={v => { setScope(v as any); setPage(0); }}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agent">Agente selecionado</SelectItem>
                <SelectItem value="all">Todos os agentes</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(daysBack)} onValueChange={v => { setDaysBack(parseInt(v, 10)); setPage(0); }}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="365">Últimos 365 dias</SelectItem>
              </SelectContent>
            </Select>
            <Select value={modelFilter} onValueChange={v => { setModelFilter(v); setPage(0); }}>
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue placeholder="Modelo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os modelos</SelectItem>
                {(m?.availableModels ?? []).map(model => (
                  <SelectItem key={model} value={model}>{model}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat
          icon={<DollarSign className="h-4 w-4" />}
          label="Custo total IA"
          value={m ? fmtUsd(m.totalMicroUsd) : "—"}
          hint={m ? `${m.totalCalls.toLocaleString("pt-BR")} chamadas LLM` : undefined}
          loading={summaryQ.isLoading}
        />
        <Stat
          icon={<Users className="h-4 w-4" />}
          label="Custo médio por lead"
          value={m ? fmtUsd(m.avgPerLeadMicroUsd) : "—"}
          hint={m ? `${m.totalLeads.toLocaleString("pt-BR")} leads ativos no período` : undefined}
          loading={summaryQ.isLoading}
        />
        <Stat
          icon={<Zap className="h-4 w-4" />}
          label="Tokens totais"
          value={m ? m.totalTokens.toLocaleString("pt-BR") : "—"}
          hint="Entrada + saída combinadas"
          loading={summaryQ.isLoading}
        />
        <Stat
          icon={<Activity className="h-4 w-4" />}
          label="Modelo mais consumido"
          value={m && m.topModel ? m.topModel.model : "—"}
          hint={m && m.topModel
            ? `${fmtUsd(m.topModel.micro)} · ${m.topModel.calls.toLocaleString("pt-BR")} chamadas`
            : undefined}
          loading={summaryQ.isLoading}
        />
        <Stat
          icon={<Coins className="h-4 w-4" />}
          label="Outras taxas"
          value={fmtUsd(totalExtraMicro)}
          hint={extrasQ.data ? `${extrasQ.data.length} item(ns)` : undefined}
          loading={extrasQ.isLoading}
        />
      </div>

      {/* Por modelo */}
      <Section
        title="Custo por modelo"
        description="Quanto cada modelo (LLM) consumiu no período."
      >
        {summaryQ.isLoading ? (
          <div className="elevated-card rounded-2xl h-32 animate-pulse" />
        ) : !m || m.byModel.length === 0 ? (
          <EmptyState
            icon={<Activity className="h-5 w-5" />}
            title="Nenhum consumo registrado"
            description="Os custos aparecem assim que o agente começar a responder mensagens."
          />
        ) : (
          <div className="elevated-card rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-background/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">Modelo</th>
                  <th className="text-right px-5 py-3 font-medium">Chamadas</th>
                  <th className="text-right px-5 py-3 font-medium">Tokens</th>
                  <th className="text-right px-5 py-3 font-medium">Custo</th>
                  <th className="text-right px-5 py-3 font-medium">% do total</th>
                </tr>
              </thead>
              <tbody>
                {m.byModel.map(row => {
                  const pct =
                    m.totalMicroUsd > 0
                      ? ((row.micro / m.totalMicroUsd) * 100).toFixed(1)
                      : "0.0";
                  return (
                    <tr key={row.model} className="border-t border-border/30">
                      <td className="px-5 py-3 font-mono text-xs">{row.model}</td>
                      <td className="px-5 py-3 text-right">{row.calls.toLocaleString("pt-BR")}</td>
                      <td className="px-5 py-3 text-right">{row.tokens.toLocaleString("pt-BR")}</td>
                      <td className="px-5 py-3 text-right font-medium">{fmtUsd(row.micro)}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Por dia (mini gráfico em barras CSS) */}
      <Section
        title="Consumo por dia"
        description="Evolução do gasto em IA durante o período."
      >
        {summaryQ.isLoading ? (
          <div className="elevated-card rounded-2xl h-40 animate-pulse" />
        ) : !m || m.byDay.length === 0 ? (
          <div className="elevated-card rounded-2xl p-6 text-sm text-muted-foreground">
            Sem dados.
          </div>
        ) : (
          <div className="elevated-card rounded-2xl p-6">
            <DayBars data={m.byDay} />
          </div>
        )}
      </Section>

      {/* Por lead */}
      <Section
        title="Custo por lead"
        description="Top leads por consumo de IA — você vê quanto cada conversa gastou."
      >
        {byLeadQ.isLoading ? (
          <div className="elevated-card rounded-2xl h-32 animate-pulse" />
        ) : !byLeadQ.data || byLeadQ.data.rows.length === 0 ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="Nenhum lead consumiu IA ainda"
            description="Quando um lead conversar com o agente, o custo aparece aqui."
          />
        ) : (
          <div className="elevated-card rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-background/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">Lead</th>
                  <th className="text-left px-5 py-3 font-medium">Telefone</th>
                  <th className="text-right px-5 py-3 font-medium">Chamadas</th>
                  <th className="text-right px-5 py-3 font-medium">Tokens</th>
                  <th className="text-right px-5 py-3 font-medium">Custo</th>
                  <th className="text-right px-5 py-3 font-medium">Última atividade</th>
                </tr>
              </thead>
              <tbody>
                {byLeadQ.data.rows.map(row => (
                  <tr key={row.leadId} className="border-t border-border/30">
                    <td className="px-5 py-3">{row.leadName || <span className="text-muted-foreground">(sem nome)</span>}</td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{row.phone}</td>
                    <td className="px-5 py-3 text-right">{row.calls.toLocaleString("pt-BR")}</td>
                    <td className="px-5 py-3 text-right">{row.tokens.toLocaleString("pt-BR")}</td>
                    <td className="px-5 py-3 text-right font-medium">{fmtUsd(row.micro)}</td>
                    <td className="px-5 py-3 text-right text-xs text-muted-foreground">
                      {row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString("pt-BR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between px-5 py-3 text-xs text-muted-foreground border-t border-border/30">
              <div>
                Mostrando {byLeadQ.data.rows.length} de {byLeadQ.data.total.toLocaleString("pt-BR")} leads
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  disabled={page === 0}
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                >
                  Anterior
                </Button>
                <div className="px-2">Página {page + 1} de {Math.max(1, Math.ceil(byLeadQ.data.total / PAGE_SIZE))}</div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  disabled={(page + 1) * PAGE_SIZE >= byLeadQ.data.total}
                  onClick={() => setPage(p => p + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* Outras taxas operacionais */}
      <Section
        title="Outras taxas operacionais"
        description="Custos manuais que devem ser somados ao total da operação (mensagens WhatsApp, hospedagem, etc.)."
        actions={<AddExtraDialog agentId={queryAgentId} onSaved={() => extrasQ.refetch()} />}
      >
        {extrasQ.isLoading ? (
          <div className="elevated-card rounded-2xl h-24 animate-pulse" />
        ) : !extrasQ.data || extrasQ.data.length === 0 ? (
          <div className="elevated-card rounded-2xl p-6 text-sm text-muted-foreground">
            Nenhuma taxa cadastrada.
          </div>
        ) : (
          <div className="elevated-card rounded-2xl divide-y divide-border/30">
            {extrasQ.data.map(e => (
              <ExtraRow
                key={e.id}
                row={e}
                onDeleted={() => extrasQ.refetch()}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Editor de preços */}
      <PriceEditor />
    </div>
  );
}

function Section({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-serif">{title}</h2>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div className="elevated-card rounded-2xl p-5">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
        {icon}
        {label}
      </div>
      {loading ? (
        <div className="h-8 mt-3 rounded bg-muted/40 animate-pulse" />
      ) : (
        <p className="text-2xl font-serif mt-3 leading-none">{value}</p>
      )}
      {hint && <p className="text-xs text-muted-foreground mt-2">{hint}</p>}
    </div>
  );
}

function DayBars({ data }: { data: Array<{ date: string; micro: number; calls: number }> }) {
  const max = Math.max(1, ...data.map(d => d.micro));
  return (
    <div className="flex items-end gap-1 h-40">
      {data.map(d => {
        const h = Math.round((d.micro / max) * 100);
        return (
          <div
            key={d.date}
            className="flex-1 flex flex-col items-center gap-1 group min-w-0"
            title={`${d.date} · ${fmtUsd(d.micro)} · ${d.calls} chamadas`}
          >
            <div
              className="w-full rounded-t bg-primary/70 group-hover:bg-primary transition-colors"
              style={{ height: `${Math.max(2, h)}%` }}
            />
            <span className="text-[9px] text-muted-foreground truncate">
              {d.date.slice(5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AddExtraDialog({
  agentId,
  onSaved,
}: {
  agentId?: number;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [amountUsd, setAmountUsd] = useState("");
  const [period, setPeriod] = useState<"monthly" | "one_time">("monthly");
  const [notes, setNotes] = useState("");
  const add = trpc.costs.extras.add.useMutation();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default">
          <Plus className="h-4 w-4 mr-1.5" /> Adicionar taxa
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova taxa operacional</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Descrição</Label>
            <Input
              placeholder="Ex.: Mensagens WhatsApp Cloud, hospedagem"
              value={label}
              onChange={e => setLabel(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor (USD)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amountUsd}
                onChange={e => setAmountUsd(e.target.value)}
              />
            </div>
            <div>
              <Label>Periodicidade</Label>
              <Select value={period} onValueChange={v => setPeriod(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="one_time">Única</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Notas (opcional)</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={async () => {
              const v = parseFloat(amountUsd);
              if (!label.trim() || isNaN(v) || v < 0) {
                toast.error("Preencha descrição e valor.");
                return;
              }
              try {
                await add.mutateAsync({
                  agentId,
                  label: label.trim(),
                  amountMicroUsd: Math.round(v * 1_000_000),
                  period,
                  notes: notes.trim() || undefined,
                });
                toast.success("Taxa adicionada.");
                setOpen(false);
                setLabel(""); setAmountUsd(""); setNotes(""); setPeriod("monthly");
                onSaved();
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
            disabled={add.isPending}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExtraRow({
  row,
  onDeleted,
}: {
  row: { id: number; label: string; amountMicroUsd: number; period: string; notes: string | null; agentId: number | null; occurredOn: Date | null };
  onDeleted: () => void;
}) {
  const del = trpc.costs.extras.remove.useMutation();
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <div className="min-w-0">
        <p className="font-medium truncate">{row.label}</p>
        <p className="text-xs text-muted-foreground">
          {row.period === "monthly" ? "Mensal" : "Única"}
          {row.agentId ? " · vinculada ao agente" : " · global"}
          {row.notes ? ` · ${row.notes}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-medium">{fmtUsd(row.amountMicroUsd)}</span>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive"
          onClick={async () => {
            if (!confirm("Remover esta taxa?")) return;
            await del.mutateAsync({ id: row.id });
            onDeleted();
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function PriceEditor() {
  const utils = trpc.useUtils();
  const pricesQ = trpc.costs.prices.list.useQuery();
  const upsert = trpc.costs.prices.upsert.useMutation();
  const reseed = trpc.costs.prices.reseed.useMutation();

  return (
    <Section
      title="Tabela de preços por modelo"
      description="Editável. Os custos são calculados a partir destes valores. Inicialmente preenchemos com a tabela pública de cada provedor."
      actions={
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await reseed.mutateAsync();
            await utils.costs.prices.list.invalidate();
            toast.success("Preços de referência reaplicados.");
          }}
          disabled={reseed.isPending}
        >
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Restaurar referência
        </Button>
      }
    >
      {pricesQ.isLoading ? (
        <div className="elevated-card rounded-2xl h-32 animate-pulse" />
      ) : !pricesQ.data || pricesQ.data.length === 0 ? (
        <div className="elevated-card rounded-2xl p-6 text-sm text-muted-foreground">
          Carregando…
        </div>
      ) : (
        <div className="elevated-card rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-background/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Modelo</th>
                <th className="text-right px-5 py-3 font-medium">Entrada (USD / 1M tokens)</th>
                <th className="text-right px-5 py-3 font-medium">Saída (USD / 1M tokens)</th>
                <th className="text-left px-5 py-3 font-medium">Notas</th>
                <th className="text-right px-5 py-3 font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {pricesQ.data.map(p => (
                <PriceRow key={p.model} row={p} onSaved={() => utils.costs.prices.list.invalidate()} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function PriceRow({
  row,
  onSaved,
}: {
  row: { model: string; inputPer1M: number; outputPer1M: number; notes: string | null };
  onSaved: () => void;
}) {
  const [input, setInput] = useState(String(microToUsd(row.inputPer1M)));
  const [output, setOutput] = useState(String(microToUsd(row.outputPer1M)));
  const [notes, setNotes] = useState(row.notes ?? "");
  const upsert = trpc.costs.prices.upsert.useMutation();

  const dirty =
    parseFloat(input) !== microToUsd(row.inputPer1M) ||
    parseFloat(output) !== microToUsd(row.outputPer1M) ||
    notes !== (row.notes ?? "");

  return (
    <tr className="border-t border-border/30">
      <td className="px-5 py-3 font-mono text-xs">{row.model}</td>
      <td className="px-5 py-3 text-right">
        <Input
          type="number"
          step="0.01"
          className="h-8 w-28 ml-auto text-right"
          value={input}
          onChange={e => setInput(e.target.value)}
        />
      </td>
      <td className="px-5 py-3 text-right">
        <Input
          type="number"
          step="0.01"
          className="h-8 w-28 ml-auto text-right"
          value={output}
          onChange={e => setOutput(e.target.value)}
        />
      </td>
      <td className="px-5 py-3">
        <Input
          className="h-8"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="—"
        />
      </td>
      <td className="px-5 py-3 text-right">
        <Button
          size="sm"
          variant={dirty ? "default" : "outline"}
          disabled={!dirty || upsert.isPending}
          onClick={async () => {
            const i = parseFloat(input);
            const o = parseFloat(output);
            if (isNaN(i) || isNaN(o) || i < 0 || o < 0) {
              toast.error("Valores inválidos.");
              return;
            }
            await upsert.mutateAsync({
              model: row.model,
              inputPer1M: Math.round(i * 1_000_000),
              outputPer1M: Math.round(o * 1_000_000),
              notes: notes.trim() || undefined,
            });
            toast.success(`Preço de ${row.model} atualizado.`);
            onSaved();
          }}
        >
          {dirty ? "Salvar" : "—"}
        </Button>
      </td>
    </tr>
  );
}

import AppLayout from "@/components/AppLayout";
import { AgentRequired } from "@/components/AgentRequired";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AVAILABLE_LLM_MODELS } from "@shared/llm-models";
import { trpc } from "@/lib/trpc";
import { Brain as BrainIcon, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const DAYS: Array<{ key: string; label: string }> = [
  { key: "mon", label: "Segunda" },
  { key: "tue", label: "Terça" },
  { key: "wed", label: "Quarta" },
  { key: "thu", label: "Quinta" },
  { key: "fri", label: "Sexta" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
];

const DEFAULT_HOURS = DAYS.reduce<Record<string, { start: string; end: string; closed?: boolean }>>(
  (acc, d) => {
    acc[d.key] = {
      start: "09:00",
      end: "18:00",
      closed: d.key === "sat" || d.key === "sun",
    };
    return acc;
  },
  {}
);

export default function OpsPage() {
  return (
    <AppLayout>
      <AgentRequired>{agentId => <Inner agentId={agentId} />}</AgentRequired>
    </AppLayout>
  );
}

function Inner({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const { data: hours } = trpc.ops.getBusinessHours.useQuery({ agentId });
  const saveHours = trpc.ops.saveBusinessHours.useMutation({
    onSuccess: () => {
      utils.ops.getBusinessHours.invalidate({ agentId });
      toast.success("Horários salvos");
    },
  });
  const { data: keywords } = trpc.ops.listHandoffKeywords.useQuery({ agentId });
  const createKeyword = trpc.ops.createHandoffKeyword.useMutation({
    onSuccess: () => utils.ops.listHandoffKeywords.invalidate({ agentId }),
  });
  const deleteKeyword = trpc.ops.deleteHandoffKeyword.useMutation({
    onSuccess: () => utils.ops.listHandoffKeywords.invalidate({ agentId }),
  });

  // — Comportamento humano —
  const { data: agent } = trpc.agents.get.useQuery({ id: agentId });
  const updateBehavior = trpc.agents.updateBehavior.useMutation({
    onSuccess: () => {
      utils.agents.get.invalidate({ id: agentId });
      toast.success("Comportamento atualizado");
    },
  });
  const [behavior, setBehavior] = useState({
    debounceSeconds: 8,
    typingSimulationEnabled: true,
    typingCps: 22,
    typingMinDelayMs: 800,
    typingMaxDelayMs: 8000,
    interMessageDelayMs: 1200,
    splitLongMessages: true,
    splitMaxChars: 220,
    toneProfile: "balanced" as "rigid" | "balanced" | "natural" | "custom",
    emojiPolicy: "sparse" as "none" | "sparse" | "rich",
    useLeadNamePct: 30,
  });
  useEffect(() => {
    if (agent) {
      setBehavior({
        debounceSeconds: agent.debounceSeconds,
        typingSimulationEnabled: agent.typingSimulationEnabled,
        typingCps: agent.typingCps,
        typingMinDelayMs: agent.typingMinDelayMs,
        typingMaxDelayMs: agent.typingMaxDelayMs,
        interMessageDelayMs: agent.interMessageDelayMs,
        splitLongMessages: agent.splitLongMessages,
        splitMaxChars: agent.splitMaxChars,
        toneProfile: ((agent as any).toneProfile as any) ?? "balanced",
        emojiPolicy: ((agent as any).emojiPolicy as any) ?? "sparse",
        useLeadNamePct: (agent as any).useLeadNamePct ?? 30,
      });
    }
  }, [agent]);
  function saveBehavior() {
    updateBehavior.mutate({ id: agentId, patch: behavior });
  }

  // — Memória da conversa (resumo evolutivo) —
  const updateSummary = trpc.agents.updateSummaryConfig.useMutation({
    onSuccess: () => {
      utils.agents.get.invalidate({ id: agentId });
      toast.success("Memória da conversa atualizada");
    },
    onError: e =>
      toast.error("Falha ao salvar memória: " + (e.message || "erro desconhecido")),
  });
  const SUMMARY_DEFAULT_SENTINEL = "__default__";
  const [summaryEveryN, setSummaryEveryN] = useState<number>(6);
  const [summaryModel, setSummaryModel] = useState<string>(SUMMARY_DEFAULT_SENTINEL);
  useEffect(() => {
    if (agent) {
      setSummaryEveryN(agent.summaryEveryN ?? 6);
      setSummaryModel(agent.summaryLlmModel ?? SUMMARY_DEFAULT_SENTINEL);
    }
  }, [agent]);
  function saveSummary() {
    updateSummary.mutate({
      id: agentId,
      patch: {
        summaryEveryN,
        summaryLlmModel:
          summaryModel === SUMMARY_DEFAULT_SENTINEL ? null : summaryModel,
      },
    });
  }

  const [enabled, setEnabled] = useState(true);
  const [tz, setTz] = useState("America/Sao_Paulo");
  const [outMsg, setOutMsg] = useState(
    "Estamos fora do horário de atendimento. Retornaremos em breve."
  );
  const [weekly, setWeekly] = useState(DEFAULT_HOURS);
  const [newKeyword, setNewKeyword] = useState("");
  const [newKeywordMsg, setNewKeywordMsg] = useState(
    "Beleza! Vou te direcionar para um atendente humano agora."
  );

  useEffect(() => {
    if (hours) {
      setEnabled(hours.enabled);
      setTz(hours.timezone);
      setOutMsg(hours.outOfHoursMessage ?? "");
      if (hours.weekly && typeof hours.weekly === "object") {
        setWeekly({ ...DEFAULT_HOURS, ...(hours.weekly as any) });
      }
    }
  }, [hours]);

  function save() {
    saveHours.mutate({
      agentId,
      enabled,
      timezone: tz,
      weekly,
      outOfHoursMessage: outMsg,
    });
  }

  return (
    <div className="container py-10 max-w-4xl space-y-8">
      <PageHeader
        eyebrow="Operação"
        title="Horário e handoff"
        description="Defina quando o agente está ativo e quais palavras-chave do lead pedem atendimento humano."
      />

      <section className="elevated-card rounded-2xl p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-medium">Comportamento humano</h3>
              <p className="text-xs text-muted-foreground max-w-xl">
                Configure o tempo que o agente espera antes de processar (debounce) e a simulação de
                digitação, para que o atendimento pareça o mais natural possível.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Debounce */}
          <div className="rounded-xl border border-border/40 bg-background/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label>Tempo de espera (debounce)</Label>
              <span className="text-sm font-mono text-primary">
                {behavior.debounceSeconds}s
              </span>
            </div>
            <Slider
              min={0}
              max={60}
              step={1}
              value={[behavior.debounceSeconds]}
              onValueChange={v =>
                setBehavior(b => ({ ...b, debounceSeconds: v[0] ?? 0 }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Tempo em segundos que o agente aguarda desde a última mensagem do lead antes de
              processar a resposta. Se o lead enviar várias mensagens em sequência, todas são
              tratadas como um único turno.
            </p>
          </div>

          {/* Toggle typing */}
          <div className="rounded-xl border border-border/40 bg-background/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label>Simular digitação</Label>
              <Switch
                checked={behavior.typingSimulationEnabled}
                onCheckedChange={v =>
                  setBehavior(b => ({ ...b, typingSimulationEnabled: v }))
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Mostra o indicador “digitando…” no WhatsApp e espera um tempo proporcional ao tamanho
              da mensagem antes de enviar. Funciona tanto na API Oficial quanto no modo QR Code.
            </p>
          </div>

          {/* CPS */}
          <div className="rounded-xl border border-border/40 bg-background/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label>Velocidade de digitação</Label>
              <span className="text-sm font-mono text-primary">
                {behavior.typingCps} caracteres/seg
              </span>
            </div>
            <Slider
              min={5}
              max={80}
              step={1}
              value={[behavior.typingCps]}
              onValueChange={v =>
                setBehavior(b => ({ ...b, typingCps: v[0] ?? 22 }))
              }
              disabled={!behavior.typingSimulationEnabled}
            />
            <p className="text-xs text-muted-foreground">
              Referências: 12 cps = devagar; 22 cps = humano normal; 50 cps = rápido.
            </p>
          </div>

          {/* Pausa entre mensagens */}
          <div className="rounded-xl border border-border/40 bg-background/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label>Pausa entre mensagens</Label>
              <span className="text-sm font-mono text-primary">
                {(behavior.interMessageDelayMs / 1000).toFixed(1)}s
              </span>
            </div>
            <Slider
              min={0}
              max={10000}
              step={100}
              value={[behavior.interMessageDelayMs]}
              onValueChange={v =>
                setBehavior(b => ({ ...b, interMessageDelayMs: v[0] ?? 0 }))
              }
              disabled={!behavior.typingSimulationEnabled}
            />
            <p className="text-xs text-muted-foreground">
              Quando o agente envia mais de uma mensagem em sequência, espera esse tempo entre
              elas.
            </p>
          </div>

          {/* Min delay */}
          <div className="rounded-xl border border-border/40 bg-background/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label>Atraso mínimo</Label>
              <span className="text-sm font-mono text-primary">
                {(behavior.typingMinDelayMs / 1000).toFixed(1)}s
              </span>
            </div>
            <Slider
              min={0}
              max={5000}
              step={100}
              value={[behavior.typingMinDelayMs]}
              onValueChange={v =>
                setBehavior(b => ({ ...b, typingMinDelayMs: v[0] ?? 0 }))
              }
              disabled={!behavior.typingSimulationEnabled}
            />
            <p className="text-xs text-muted-foreground">
              Tempo mínimo de digitação, mesmo para mensagens curtas.
            </p>
          </div>

          {/* Max delay */}
          <div className="rounded-xl border border-border/40 bg-background/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label>Atraso máximo</Label>
              <span className="text-sm font-mono text-primary">
                {(behavior.typingMaxDelayMs / 1000).toFixed(1)}s
              </span>
            </div>
            <Slider
              min={1000}
              max={20000}
              step={500}
              value={[behavior.typingMaxDelayMs]}
              onValueChange={v =>
                setBehavior(b => ({ ...b, typingMaxDelayMs: v[0] ?? 8000 }))
              }
              disabled={!behavior.typingSimulationEnabled}
            />
            <p className="text-xs text-muted-foreground">
              Limite máximo, para mensagens longas não demorarem demais.
            </p>
          </div>
        </div>

        {/* Quebra de mensagens longas */}
        <div className="rounded-xl border border-border/40 bg-background/40 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Quebrar mensagens longas em vários balões</Label>
              <p className="text-xs text-muted-foreground max-w-md">
                Em vez de enviar um único blocão, o agente divide a resposta em parágrafos/frases
                e envia como mensagens separadas, com indicador "digitando…" entre cada uma.
              </p>
            </div>
            <Switch
              checked={behavior.splitLongMessages}
              onCheckedChange={v =>
                setBehavior(b => ({ ...b, splitLongMessages: v }))
              }
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Tamanho máximo por balão</Label>
              <span className="text-sm font-mono text-primary">
                {behavior.splitMaxChars} caracteres
              </span>
            </div>
            <Slider
              min={80}
              max={600}
              step={10}
              value={[behavior.splitMaxChars]}
              onValueChange={v =>
                setBehavior(b => ({ ...b, splitMaxChars: v[0] ?? 220 }))
              }
              disabled={!behavior.splitLongMessages}
            />
            <p className="text-xs text-muted-foreground">
              Mensagens menores parecem mais humanas. Recomendado entre 180 e 280.
            </p>
          </div>
        </div>

        {/* ─── Estilo de escrita ─── */}
        <div className="rounded-xl border border-border/40 bg-muted/20 p-5 space-y-5">
          <div>
            <h4 className="font-medium">Estilo de escrita</h4>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              Define como o agente escreve. O preset <strong>natural</strong> usa
              gírias brasileiras leves ("cê", "rapidinho", "top"), mensagens curtas
              e elimina formalismo corporativo. O preset <strong>balanced</strong> é
              o padrão profissional. O preset <strong>rigid</strong> mantém formalidade.
              Use <strong>custom</strong> para deixar que o campo "Tom de voz" do
              cérebro seja o único guia.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label>Perfil de tom</Label>
              <Select
                value={behavior.toneProfile}
                onValueChange={(v: any) =>
                  setBehavior(b => ({ ...b, toneProfile: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="natural">Natural — conversacional brasileiro (estilo WhatsApp)</SelectItem>
                  <SelectItem value="balanced">Balanceado — profissional e amigável (padrão)</SelectItem>
                  <SelectItem value="rigid">Rígido — corporativo e formal</SelectItem>
                  <SelectItem value="custom">Customizado — usa o campo “Tom de voz” do cérebro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Política de emojis</Label>
              <Select
                value={behavior.emojiPolicy}
                onValueChange={(v: any) =>
                  setBehavior(b => ({ ...b, emojiPolicy: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum — jamais usar emojis</SelectItem>
                  <SelectItem value="sparse">Parcimonioso — 1 a cada 2-3 mensagens, semântico</SelectItem>
                  <SelectItem value="rich">Rico — livre, até 2-3 por mensagem</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Frequência do nome do lead nas mensagens</Label>
              <span className="text-sm font-mono text-primary">
                {behavior.useLeadNamePct}%
              </span>
            </div>
            <Slider
              min={0}
              max={100}
              step={5}
              value={[behavior.useLeadNamePct]}
              onValueChange={v =>
                setBehavior(b => ({ ...b, useLeadNamePct: v[0] ?? 30 }))
              }
            />
            <p className="text-xs text-muted-foreground">
              0% = nunca cita o nome. 30% = uso natural (recomendado).
              80%+ = soa forçado. O agente nunca inventa nome se o lead não se apresentou.
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={saveBehavior} disabled={updateBehavior.isPending}>
            Salvar comportamento
          </Button>
        </div>
      </section>

      {/* ─── Memória da conversa ─── */}
      <section className="elevated-card rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary">
              <BrainIcon className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-medium">Memória da conversa</h3>
              <p className="text-xs text-muted-foreground max-w-xl">
                O agente mantém um <strong>resumo evolutivo</strong> de cada conversa
                e o lê antes de cada resposta para não repetir perguntas e não
                perder o contexto. Você pode escolher a frequência da atualização
                e qual modelo de LLM faz esse resumo.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Atualizar resumo a cada</Label>
              <span className="text-sm tabular-nums text-muted-foreground">
                {summaryEveryN} mensagens
              </span>
            </div>
            <Slider
              min={3}
              max={30}
              step={1}
              value={[summaryEveryN]}
              onValueChange={v => setSummaryEveryN(v[0] ?? 6)}
            />
            <p className="text-xs text-muted-foreground">
              Valores menores deixam o resumo mais fresco mas consomem mais
              créditos de LLM. Recomendado entre 5 e 10.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Modelo do resumidor</Label>
            <Select value={summaryModel} onValueChange={setSummaryModel}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione um modelo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SUMMARY_DEFAULT_SENTINEL}>
                  Usar modelo padrão do agente{" "}
                  {agent?.defaultLlmModel ? `(${agent.defaultLlmModel})` : ""}
                </SelectItem>
                {AVAILABLE_LLM_MODELS.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label} — {m.provider}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Modelos pequenos (gpt-4o-mini, haiku, gemini-flash) costumam ser
              suficientes e mais baratos para resumir.
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={saveSummary} disabled={updateSummary.isPending}>
            Salvar memória
          </Button>
        </div>
      </section>

      <section className="elevated-card rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">Horário de atendimento</h3>
            <p className="text-xs text-muted-foreground">
              Fora destes horários a IA responde com a mensagem definida abaixo.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Fuso horário</Label>
            <Input value={tz} onChange={e => setTz(e.target.value)} />
          </div>
          <div>
            <Label>Mensagem fora do horário</Label>
            <Textarea
              rows={2}
              value={outMsg}
              onChange={e => setOutMsg(e.target.value)}
              placeholder="Ex.: Estamos fora do horário..."
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DAYS.map(d => (
            <div
              key={d.key}
              className="flex items-center gap-3 rounded-xl border border-border/40 px-4 py-3 bg-background/40"
            >
              <span className="w-20 text-sm">{d.label}</span>
              <Switch
                checked={!weekly[d.key]?.closed}
                onCheckedChange={v =>
                  setWeekly({ ...weekly, [d.key]: { ...weekly[d.key], closed: !v } })
                }
              />
              <Input
                type="time"
                disabled={weekly[d.key]?.closed}
                value={weekly[d.key]?.start ?? "09:00"}
                onChange={e =>
                  setWeekly({ ...weekly, [d.key]: { ...weekly[d.key], start: e.target.value } })
                }
                className="h-8 w-24"
              />
              <span className="text-muted-foreground text-xs">até</span>
              <Input
                type="time"
                disabled={weekly[d.key]?.closed}
                value={weekly[d.key]?.end ?? "18:00"}
                onChange={e =>
                  setWeekly({ ...weekly, [d.key]: { ...weekly[d.key], end: e.target.value } })
                }
                className="h-8 w-24"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saveHours.isPending}>
            Salvar horários
          </Button>
        </div>
      </section>

      <section className="elevated-card rounded-2xl p-6 space-y-5">
        <div>
          <h3 className="font-medium">Palavras-chave para handoff humano</h3>
          <p className="text-xs text-muted-foreground">
            Quando o lead enviar qualquer uma destas palavras, a IA pausa e a conversa entra em
            atendimento humano automaticamente.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            placeholder="Ex.: atendente, humano, falar com pessoa"
            value={newKeyword}
            onChange={e => setNewKeyword(e.target.value)}
          />
          <div className="flex gap-2">
            <Input
              placeholder="Mensagem ao lead ao acionar (opcional)"
              value={newKeywordMsg}
              onChange={e => setNewKeywordMsg(e.target.value)}
            />
            <Button
              onClick={() => {
                if (!newKeyword.trim()) return toast.error("Digite a palavra-chave");
                createKeyword.mutate({
                  agentId,
                  keyword: newKeyword.trim(),
                  notifyMessage: newKeywordMsg || null,
                });
                setNewKeyword("");
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(keywords ?? []).map(k => (
            <Badge key={k.id} variant="outline" className="text-xs flex items-center gap-1">
              {k.keyword}
              <button
                onClick={() => deleteKeyword.mutate({ id: k.id })}
                className="ml-1 text-muted-foreground hover:text-destructive"
                title="Remover"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {(!keywords || keywords.length === 0) && (
            <p className="text-xs text-muted-foreground">Nenhuma palavra-chave configurada.</p>
          )}
        </div>
      </section>
    </div>
  );
}

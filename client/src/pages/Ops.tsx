import AppLayout from "@/components/AppLayout";
import { AgentRequired } from "@/components/AgentRequired";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Plus, Trash2 } from "lucide-react";
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

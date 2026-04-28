import AppLayout from "@/components/AppLayout";
import { AgentRequired } from "@/components/AgentRequired";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  AlarmClockCheck,
  Clock,
  HelpCircle,
  Image as ImageIcon,
  Info,
  Plus,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MediaTagTextarea } from "@/components/MediaTagTextarea";

type WindowPolicy = "auto" | "force_template" | "force_free";
type MessageMode = "ai_generated" | "fixed_text" | "template";
type DelayUnit = "minutes" | "hours" | "days";

export default function FollowupsPage() {
  return (
    <AppLayout>
      <AgentRequired>{agentId => <Inner agentId={agentId} />}</AgentRequired>
    </AppLayout>
  );
}

function Inner({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const { data: rules } = trpc.followup.listRules.useQuery({ agentId });
  const { data: templates } = trpc.whatsapp.listTemplates.useQuery({ agentId });
  const { data: mediaList } = trpc.media.list.useQuery({ agentId });

  const create = trpc.followup.createRule.useMutation({
    onSuccess: () => {
      utils.followup.listRules.invalidate({ agentId });
      setOpen(false);
      toast.success("Regra criada");
    },
  });
  const update = trpc.followup.updateRule.useMutation({
    onSuccess: () => utils.followup.listRules.invalidate({ agentId }),
  });
  const del = trpc.followup.deleteRule.useMutation({
    onSuccess: () => utils.followup.listRules.invalidate({ agentId }),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    delayValue: number;
    delayUnit: DelayUnit;
    allowedStartHour: number;
    allowedEndHour: number;
    messageMode: MessageMode;
    fixedText: string;
    aiInstruction: string;
    windowPolicy: WindowPolicy;
    templateId: number | null;
    templateVariables: string;
    cancelOnReply: boolean;
    isActive: boolean;
  }>({
    name: "",
    delayValue: 2,
    delayUnit: "hours",
    allowedStartHour: 8,
    allowedEndHour: 21,
    messageMode: "ai_generated",
    fixedText: "",
    aiInstruction: "",
    windowPolicy: "auto",
    templateId: null,
    templateVariables: "",
    cancelOnReply: true,
    isActive: true,
  });

  const tentativaIndex = useMemo(() => {
    if (!editing) return (rules?.length ?? 0) + 1;
    const idx = (rules ?? []).findIndex((r: any) => r.id === editing.id);
    return idx >= 0 ? idx + 1 : 1;
  }, [editing, rules]);

  function delayToValueUnit(min: number): { v: number; u: DelayUnit } {
    if (min % 1440 === 0 && min >= 1440) return { v: min / 1440, u: "days" };
    if (min % 60 === 0 && min >= 60) return { v: min / 60, u: "hours" };
    return { v: min, u: "minutes" };
  }
  function valueUnitToMinutes(v: number, u: DelayUnit) {
    if (u === "days") return v * 1440;
    if (u === "hours") return v * 60;
    return v;
  }

  function openCreate() {
    setEditing(null);
    setForm({
      name: `Reengajamento ${(rules?.length ?? 0) + 1}`,
      delayValue: 2,
      delayUnit: "hours",
      allowedStartHour: 8,
      allowedEndHour: 21,
      messageMode: "ai_generated",
      fixedText: "",
      aiInstruction:
        "Crie um follow-up inteligente para trazer a atenção do usuário de volta com algo relevante baseado na última conversa.",
      windowPolicy: "auto",
      templateId: null,
      templateVariables: "",
      cancelOnReply: true,
      isActive: true,
    });
    setOpen(true);
  }
  function openEdit(r: any) {
    setEditing(r);
    const { v, u } = delayToValueUnit(r.delayMinutes);
    setForm({
      name: r.name,
      delayValue: v,
      delayUnit: u,
      allowedStartHour: r.allowedStartHour ?? 8,
      allowedEndHour: r.allowedEndHour ?? 21,
      messageMode: r.messageMode,
      fixedText: r.fixedText ?? "",
      aiInstruction: r.aiInstruction ?? "",
      windowPolicy: r.windowPolicy,
      templateId: r.templateId,
      templateVariables: Array.isArray(r.templateVariables) ? r.templateVariables.join(", ") : "",
      cancelOnReply: r.cancelOnReply,
      isActive: r.isActive,
    });
    setOpen(true);
  }
  function submit() {
    if (!form.name.trim()) return toast.error("Nome é obrigatório");
    if (form.messageMode === "fixed_text" && !form.fixedText.trim())
      return toast.error("Texto fixo é obrigatório");
    if (form.messageMode === "ai_generated" && !form.aiInstruction.trim())
      return toast.error("Instruções para a IA são obrigatórias");
    if (form.messageMode === "template" && !form.templateId)
      return toast.error("Selecione um template");
    if (form.windowPolicy === "force_template" && !form.templateId)
      return toast.error("Para 'forçar template' você precisa escolher um template aprovado");
    if (form.delayValue < 1) return toast.error("Tempo de espera precisa ser ≥ 1");
    if (form.allowedStartHour === form.allowedEndHour)
      return toast.error("Hora inicial e final não podem ser iguais");

    const payload = {
      name: form.name,
      delayMinutes: valueUnitToMinutes(form.delayValue, form.delayUnit),
      messageMode: form.messageMode,
      fixedText: form.fixedText || null,
      aiInstruction: form.aiInstruction || null,
      windowPolicy: form.windowPolicy,
      templateId: form.templateId,
      templateVariables: form.templateVariables
        .split(",")
        .map(v => v.trim())
        .filter(Boolean),
      cancelOnReply: form.cancelOnReply,
      allowedStartHour: form.allowedStartHour,
      allowedEndHour: form.allowedEndHour,
      isActive: form.isActive,
    };

    if (editing) {
      update.mutate(
        { id: editing.id, patch: payload },
        {
          onSuccess: () => {
            setOpen(false);
            toast.success("Regra atualizada");
          },
        }
      );
    } else {
      create.mutate({ agentId, orderIndex: rules?.length ?? 0, ...payload });
    }
  }

  return (
    <div className="container py-10 max-w-4xl">
      <PageHeader
        eyebrow="Reengajamento"
        title="Follow-ups automáticos"
        description="Configure como o agente reengaja leads silenciosos. Defina tempo de espera, janela de horário permitido e mensagem (texto, IA contextual ou template). Você pode anexar mídias da biblioteca usando @midia[nome]."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nova regra
          </Button>
        }
      />

      {!rules || rules.length === 0 ? (
        <EmptyState
          icon={<AlarmClockCheck className="h-5 w-5" />}
          title="Nenhuma regra de follow-up"
          description="Sugestão: tentativa 1 após 2h (sessão), tentativa 2 após 24h, tentativa 3 após 72h."
          action={<Button onClick={openCreate}>Criar primeira regra</Button>}
        />
      ) : (
        <div className="space-y-3">
          {rules.map((r: any, idx: number) => (
            <div key={r.id} className="elevated-card rounded-2xl p-5">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-accent/15 grid place-items-center text-accent shrink-0 font-medium">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium">{r.name}</h3>
                    <Badge variant="outline" className="text-xs">
                      após {formatMinutes(r.delayMinutes)}
                    </Badge>
                    {(r.allowedStartHour != null || r.allowedEndHour != null) && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Clock className="h-3 w-3" />
                        {pad(r.allowedStartHour ?? 0)}:00–{pad(r.allowedEndHour ?? 23)}:00
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {r.messageMode === "ai_generated" && "IA gera mensagem"}
                      {r.messageMode === "fixed_text" && "texto fixo"}
                      {r.messageMode === "template" && "via template"}
                    </Badge>
                    {r.cancelOnReply && (
                      <Badge variant="outline" className="text-xs">
                        cancela se lead responder
                      </Badge>
                    )}
                  </div>
                  {r.fixedText && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{r.fixedText}</p>
                  )}
                  {r.aiInstruction && (
                    <p className="text-xs text-muted-foreground italic line-clamp-2">
                      <span className="font-medium not-italic">IA:</span> {r.aiInstruction}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2 items-end">
                  <Switch
                    checked={r.isActive}
                    onCheckedChange={v => update.mutate({ id: r.id, patch: { isActive: v } })}
                  />
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm(`Remover a regra "${r.name}"?`)) del.mutate({ id: r.id });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? `Editar Reengajamento — Tentativa nº ${tentativaIndex}`
                : `Novo Reengajamento — Tentativa nº ${tentativaIndex}`}
            </DialogTitle>
            <DialogDescription>
              Quando, em qual janela do dia, e qual mensagem (livre, com IA, ou template).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Linha 1: Tempo + Hora ini + Hora fim */}
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-5">
                <Label className="flex items-center gap-1">
                  Tempo de espera
                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={1}
                    className="w-20"
                    value={form.delayValue}
                    onChange={e =>
                      setForm({ ...form, delayValue: Math.max(1, parseInt(e.target.value || "1", 10)) })
                    }
                  />
                  <Select
                    value={form.delayUnit}
                    onValueChange={(v: DelayUnit) => setForm({ ...form, delayUnit: v })}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">Minutos</SelectItem>
                      <SelectItem value="hours">Horas</SelectItem>
                      <SelectItem value="days">Dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="col-span-3">
                <Label className="flex items-center gap-1">
                  Hora inicial permitida
                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                </Label>
                <Input
                  type="time"
                  value={`${pad(form.allowedStartHour)}:00`}
                  onChange={e => {
                    const h = parseInt(e.target.value.split(":")[0] || "0", 10);
                    setForm({ ...form, allowedStartHour: h });
                  }}
                />
              </div>
              <div className="col-span-3">
                <Label className="flex items-center gap-1">
                  Hora final permitida
                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                </Label>
                <Input
                  type="time"
                  value={`${pad(form.allowedEndHour)}:00`}
                  onChange={e => {
                    const h = parseInt(e.target.value.split(":")[0] || "0", 10);
                    setForm({ ...form, allowedEndHour: h });
                  }}
                />
              </div>
              <div className="col-span-1 flex items-end justify-center">
                <div className="text-[10px] text-muted-foreground text-center pb-2">
                  fuso BR
                </div>
              </div>
            </div>

            <div>
              <Label>Nome interno</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Reengajamento 2h"
              />
            </div>

            {/* Template (Meta) */}
            <div>
              <Label className="flex items-center gap-1">
                Template (Meta) — Somente para WhatsApp API Oficial
                <HelpCircle className="h-3 w-3 text-muted-foreground" />
              </Label>
              <Select
                value={form.templateId ? String(form.templateId) : "none"}
                onValueChange={v =>
                  setForm({ ...form, templateId: v === "none" ? null : parseInt(v, 10) })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum template disponível" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {(templates ?? [])
                    .filter((t: any) => t.status === "approved")
                    .map((t: any) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name} ({t.languageCode})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Origem da mensagem</Label>
              <Select
                value={form.messageMode}
                onValueChange={(v: MessageMode) => setForm({ ...form, messageMode: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ai_generated">IA gera mensagem (contextual)</SelectItem>
                  <SelectItem value="fixed_text">Texto fixo</SelectItem>
                  <SelectItem value="template">Conteúdo do template</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Textarea principal com autocomplete @midia[] */}
            {(form.messageMode === "ai_generated" || form.messageMode === "fixed_text") && (
              <div>
                <Label>
                  {form.messageMode === "ai_generated"
                    ? "Instrução para IA gerar a mensagem de follow-up (reengajamento)"
                    : "Texto fixo da mensagem"}
                </Label>
                <MediaTagTextarea
                  value={form.messageMode === "ai_generated" ? form.aiInstruction : form.fixedText}
                  onChange={v =>
                    form.messageMode === "ai_generated"
                      ? setForm({ ...form, aiInstruction: v })
                      : setForm({ ...form, fixedText: v })
                  }
                  mediaList={(mediaList ?? []) as any[]}
                  rows={5}
                  placeholder={
                    form.messageMode === "ai_generated"
                      ? `Crie um follow-up inteligente para trazer a atenção do usuário de volta com algo do tipo: "Se liga aqui o que os nossos membros falam sobre o nosso modelo." e envie o vídeo @midia[membros.mp4]`
                      : "Oi {nome}, você ainda tem interesse em..."
                  }
                  hintLine={
                    <span>
                      <span className="text-accent">💡 Dica:</span> use{" "}
                      <code className="bg-muted px-1 rounded">@</code> para mídia. As mídias resolvidas
                      são enviadas em sequência logo após o texto.
                    </span>
                  }
                />
              </div>
            )}

            <div>
              <Label>Política de janela 24h (Cloud API)</Label>
              <Select
                value={form.windowPolicy}
                onValueChange={(v: WindowPolicy) => setForm({ ...form, windowPolicy: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto · livre se dentro de 24h, template se fora</SelectItem>
                  <SelectItem value="force_free">Só dentro da janela 24h</SelectItem>
                  <SelectItem value="force_template">Sempre via template aprovado</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                No modo QR (não oficial) o envio é sempre livre — esta política só vale para Cloud API.
              </p>
            </div>

            {(form.windowPolicy === "force_template" || form.messageMode === "template") && (
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label>Variáveis do template (em ordem)</Label>
                  <Input
                    value={form.templateVariables}
                    onChange={e => setForm({ ...form, templateVariables: e.target.value })}
                    placeholder="{nome}, oferta"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.cancelOnReply}
                  onCheckedChange={v => setForm({ ...form, cancelOnReply: v })}
                />
                <Label>Cancelar se o lead responder antes</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={v => setForm({ ...form, isActive: v })}
                />
                <Label>Regra ativa</Label>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowHelp(!showHelp)}
              className="text-xs text-accent inline-flex items-center gap-1.5 hover:underline"
            >
              <Info className="h-3.5 w-3.5" />
              Orientações de como criar um follow-up
            </button>
            {showHelp && (
              <div className="rounded-lg border border-accent/30 bg-accent/10 p-4 text-xs space-y-2">
                <div className="font-medium text-accent flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5" /> Uso de Mídias
                </div>
                <p>
                  Você pode incluir mídias (imagens, vídeos, áudios, documentos) no seu follow-up
                  usando o caractere <code className="bg-muted px-1 rounded">@</code>.
                </p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>
                    Digite <code className="bg-muted px-1 rounded">@</code> no campo de instrução
                  </li>
                  <li>Um menu aparecerá com suas mídias disponíveis</li>
                  <li>
                    Selecione a mídia desejada ou use os atalhos rápidos abaixo da prévia
                  </li>
                  <li>
                    A mídia será inserida como{" "}
                    <code className="bg-muted px-1 rounded">@midia[nome-da-midia]</code>
                  </li>
                </ol>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function pad(n: number) {
  return String(Math.max(0, Math.min(23, n))).padStart(2, "0");
}

function formatMinutes(m: number) {
  if (m < 60) return `${m}min`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

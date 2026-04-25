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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { ArrowDown, ArrowUp, ListOrdered, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function StepsPage() {
  return (
    <AppLayout>
      <AgentRequired>{agentId => <StepsEditor agentId={agentId} />}</AgentRequired>
    </AppLayout>
  );
}

function StepsEditor({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const { data: steps } = trpc.steps.list.useQuery({ agentId });
  const { data: models } = trpc.catalog.llmModels.useQuery();
  const { data: agent } = trpc.agents.get.useQuery({ id: agentId });
  const create = trpc.steps.create.useMutation({
    onSuccess: () => {
      utils.steps.list.invalidate({ agentId });
      setOpen(false);
      toast.success("Etapa criada");
    },
  });
  const update = trpc.steps.update.useMutation({
    onSuccess: () => utils.steps.list.invalidate({ agentId }),
  });
  const del = trpc.steps.delete.useMutation({
    onSuccess: () => {
      utils.steps.list.invalidate({ agentId });
      toast.success("Etapa removida");
    },
  });
  const reorder = trpc.steps.reorder.useMutation({
    onSuccess: () => utils.steps.list.invalidate({ agentId }),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    name: "",
    instructions: "",
    completionCriteria: "",
    llmModel: "",
    isMandatory: true,
    literalMode: false,
    literalText: "",
    // 0 = sem limite. UI converte para null no payload.
    maxMessages: 0,
  });

  function openCreate() {
    setEditing(null);
    setForm({
      name: "",
      instructions: "",
      completionCriteria: "",
      llmModel: "",
      isMandatory: true,
      literalMode: false,
      literalText: "",
      maxMessages: 0,
    });
    setOpen(true);
  }
  function openEdit(s: any) {
    setEditing(s);
    setForm({
      name: s.name,
      instructions: s.instructions,
      completionCriteria: s.completionCriteria ?? "",
      llmModel: s.llmModel ?? "",
      isMandatory: s.isMandatory,
      literalMode: !!s.literalMode,
      literalText: s.literalText ?? "",
      maxMessages: s.maxMessages ?? 0,
    });
    setOpen(true);
  }

  function submit() {
    if (!form.name.trim() || !form.instructions.trim()) {
      toast.error("Nome e instruções são obrigatórios");
      return;
    }
    const payload = {
      ...form,
      llmModel: form.llmModel || null,
      completionCriteria: form.completionCriteria || null,
      literalText: form.literalMode ? form.literalText : null,
      // 0 ou negativo = sem limite → envia null para o backend
      maxMessages:
        form.maxMessages && form.maxMessages > 0 ? form.maxMessages : null,
    };
    if (editing) {
      update.mutate(
        { id: editing.id, patch: payload },
        {
          onSuccess: () => {
            setOpen(false);
            toast.success("Etapa atualizada");
          },
        }
      );
    } else {
      create.mutate({ agentId, orderIndex: (steps?.length ?? 0), ...payload });
    }
  }

  function move(idx: number, dir: -1 | 1) {
    if (!steps) return;
    const newOrder = [...steps];
    const target = idx + dir;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
    reorder.mutate({ ids: newOrder.map(s => s.id) });
  }

  return (
    <div className="container py-10 max-w-4xl">
      <PageHeader
        eyebrow="Configuração"
        title="Etapas do script"
        description="O agente segue rigorosamente esta sequência. Cada etapa pode usar um modelo LLM diferente e tem seu próprio critério para avançar."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nova etapa
          </Button>
        }
      />

      {!steps || steps.length === 0 ? (
        <EmptyState
          icon={<ListOrdered className="h-5 w-5" />}
          title="Defina as etapas do funil"
          description="Sugestão: Saudação → Qualificação → Apresentação → Objeções → Fechamento."
          action={<Button onClick={openCreate}>Criar primeira etapa</Button>}
        />
      ) : (
        <div className="space-y-3">
          {steps.map((s, idx) => (
            <div key={s.id} className="elevated-card rounded-2xl p-5">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary/15 grid place-items-center text-primary font-medium shrink-0">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium">{s.name}</h3>
                    {s.isMandatory && (
                      <span className="text-[10px] uppercase tracking-wider text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded">
                        obrigatória
                      </span>
                    )}
                    {s.llmModel && (
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        modelo: {s.llmModel}
                      </span>
                    )}
                    {!s.llmModel && agent && (
                      <span className="text-[10px] text-muted-foreground">
                        usa modelo padrão · {agent.defaultLlmModel}
                      </span>
                    )}
                    {s.literalMode && (
                      <span className="text-[10px] uppercase tracking-wider text-amber-400/90 bg-amber-400/10 px-1.5 py-0.5 rounded">
                        literal
                      </span>
                    )}
                    {typeof s.maxMessages === "number" && s.maxMessages > 0 && (
                      <span className="text-[10px] uppercase tracking-wider text-cyan-400/90 bg-cyan-400/10 px-1.5 py-0.5 rounded">
                        máx {s.maxMessages} msg
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2 whitespace-pre-wrap">
                    {s.instructions}
                  </p>
                  {s.completionCriteria && (
                    <p className="text-xs text-muted-foreground mt-1.5">
                      <span className="font-medium">Avança quando:</span> {s.completionCriteria}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="icon" variant="ghost" onClick={() => move(idx, -1)} disabled={idx === 0}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => move(idx, 1)}
                    disabled={idx === steps.length - 1}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="sm" variant="outline" onClick={() => openEdit(s)}>
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => {
                      if (confirm(`Remover etapa "${s.name}"?`)) del.mutate({ id: s.id });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar etapa" : "Nova etapa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome da etapa</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Ex.: Qualificação"
              />
            </div>
            <div>
              <Label>Instruções específicas</Label>
              <Textarea
                rows={6}
                value={form.instructions}
                onChange={e => setForm({ ...form, instructions: e.target.value })}
                placeholder="Pergunte o ramo de atividade. Pergunte o tamanho do time. Não fale ainda do preço."
                className="font-mono text-sm"
              />
            </div>
            <div>
              <Label>Critério para avançar</Label>
              <Textarea
                rows={2}
                value={form.completionCriteria}
                onChange={e => setForm({ ...form, completionCriteria: e.target.value })}
                placeholder="Quando o lead já informou ramo e tamanho do time."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Modelo LLM nesta etapa</Label>
                <Select
                  value={form.llmModel || "default"}
                  onValueChange={v => setForm({ ...form, llmModel: v === "default" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Usar modelo padrão do agente</SelectItem>
                    {(models ?? []).map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label} <span className="text-muted-foreground">· {m.provider}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-3">
                <div className="flex items-center gap-3 mb-2">
                  <Switch
                    checked={form.isMandatory}
                    onCheckedChange={v => setForm({ ...form, isMandatory: v })}
                  />
                  <Label className="cursor-pointer">Etapa obrigatória</Label>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 p-4 space-y-3 bg-muted/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="cursor-pointer">Modo literal</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Quando ativado, o agente envia exatamente o texto abaixo nesta etapa, sem reescrever via LLM.
                  </p>
                </div>
                <Switch
                  checked={form.literalMode}
                  onCheckedChange={v => setForm({ ...form, literalMode: v })}
                />
              </div>
              {form.literalMode && (
                <Textarea
                  rows={4}
                  value={form.literalText}
                  onChange={e => setForm({ ...form, literalText: e.target.value })}
                  placeholder="Texto exato que o agente vai enviar nesta etapa."
                />
              )}
            </div>

            <div className="rounded-xl border border-border/60 p-4 space-y-3 bg-muted/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="cursor-pointer">Avançar após N mensagens (anti-trava)</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Se a IA enviar mais de N mensagens nesta etapa sem o critério ser cumprido, ela avança automaticamente para a próxima. Use 0 para desativar.
                  </p>
                </div>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={50}
                  step={1}
                  className="w-24 text-right"
                  value={form.maxMessages ?? 0}
                  onChange={e => {
                    const v = parseInt(e.target.value, 10);
                    setForm({
                      ...form,
                      maxMessages: Number.isFinite(v) ? Math.max(0, Math.min(50, v)) : 0,
                    });
                  }}
                />
              </div>
              {form.maxMessages > 0 && (
                <p className="text-[11px] text-amber-400/80">
                  Auto-avanço ativo: após {form.maxMessages} mensagem(ns) da IA nesta etapa, o agente vai para a próxima etapa antes de gerar a resposta seguinte.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={create.isPending || update.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
import { Textarea } from "@/components/ui/textarea";
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
import { AlarmClockCheck, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type WindowPolicy = "auto" | "force_template" | "force_free";
type MessageMode = "ai_generated" | "fixed_text" | "template";

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
  const [form, setForm] = useState<{
    name: string;
    delayMinutes: number;
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
    delayMinutes: 60,
    messageMode: "fixed_text",
    fixedText: "",
    aiInstruction: "",
    windowPolicy: "auto",
    templateId: null,
    templateVariables: "",
    cancelOnReply: true,
    isActive: true,
  });

  function openCreate() {
    setEditing(null);
    setForm({
      name: "Reengajamento 1h",
      delayMinutes: 60,
      messageMode: "fixed_text",
      fixedText: "Oi! Continua por aí?",
      aiInstruction: "",
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
    setForm({
      name: r.name,
      delayMinutes: r.delayMinutes,
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

    const payload = {
      name: form.name,
      delayMinutes: form.delayMinutes,
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
        description="Configure exatamente quando e como o agente deve reengajar leads silenciosos. Cada tentativa pode usar a janela 24h (mensagem livre) ou um template aprovado, com texto fixo ou gerado pela IA."
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
          description="Sugestão: tentativa 1 após 1h (sessão), tentativa 2 após 24h (template), tentativa 3 após 72h (template)."
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
                    <Badge variant="outline" className="text-xs">
                      {r.messageMode === "ai_generated" && "IA gera mensagem"}
                      {r.messageMode === "fixed_text" && "texto fixo"}
                      {r.messageMode === "template" && "via template"}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {r.windowPolicy === "auto" && "auto (livre dentro de 24h, senão template)"}
                      {r.windowPolicy === "force_free" && "só dentro de 24h"}
                      {r.windowPolicy === "force_template" && "sempre template"}
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
                    <p className="text-xs text-muted-foreground italic">
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar regra" : "Nova regra de follow-up"}</DialogTitle>
            <DialogDescription>
              Defina o intervalo, a origem da mensagem e a política de janela 24h.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Nome interno</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Reengajamento 1h"
                />
              </div>
              <div>
                <Label>Disparar após (minutos sem resposta)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.delayMinutes}
                  onChange={e =>
                    setForm({ ...form, delayMinutes: parseInt(e.target.value || "0", 10) })
                  }
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  60 = 1h · 1440 = 24h · 4320 = 72h
                </p>
              </div>
              <div>
                <Label>Política de janela 24h</Label>
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
              </div>
            </div>

            <div>
              <Label>Origem da mensagem</Label>
              <Select
                value={form.messageMode}
                onValueChange={(v: MessageMode) => setForm({ ...form, messageMode: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed_text">Texto fixo</SelectItem>
                  <SelectItem value="ai_generated">IA gera mensagem (contextual)</SelectItem>
                  <SelectItem value="template">Conteúdo do template</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.messageMode === "fixed_text" && (
              <div>
                <Label>Texto fixo</Label>
                <Textarea
                  rows={3}
                  value={form.fixedText}
                  onChange={e => setForm({ ...form, fixedText: e.target.value })}
                  placeholder="Oi {nome}, você ainda tem interesse em..."
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Se a janela 24h estiver fechada e a política for <code>auto</code> ou <code>force_template</code>, o sistema substitui pelo template selecionado.
                </p>
              </div>
            )}

            {form.messageMode === "ai_generated" && (
              <div>
                <Label>Instruções para a IA</Label>
                <Textarea
                  rows={3}
                  value={form.aiInstruction}
                  onChange={e => setForm({ ...form, aiInstruction: e.target.value })}
                  placeholder="Reengaje o lead com base na última mensagem. Tom leve."
                />
              </div>
            )}

            {(form.windowPolicy !== "force_free" || form.messageMode === "template") && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Template aprovado</Label>
                  <Select
                    value={form.templateId ? String(form.templateId) : "none"}
                    onValueChange={v =>
                      setForm({ ...form, templateId: v === "none" ? null : parseInt(v, 10) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
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
                  <Label>Variáveis do template (em ordem)</Label>
                  <Input
                    value={form.templateVariables}
                    onChange={e => setForm({ ...form, templateVariables: e.target.value })}
                    placeholder="{nome}, oferta"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-6">
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

function formatMinutes(m: number) {
  if (m < 60) return `${m}min`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

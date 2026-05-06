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
import { Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export default function ObjectionsPage() {
  return (
    <AppLayout>
      <AgentRequired>{agentId => <ObjectionsEditor agentId={agentId} />}</AgentRequired>
    </AppLayout>
  );
}

type FormState = {
  name: string;
  description: string;
  triggerKeywordsText: string;
  triggerRegexText: string;
  responseTemplate: string;
  literalResponse: boolean;
  mediaIds: number[];
  nextStepAction: "stay" | "advance" | "restart";
  priority: number;
  isActive: boolean;
  sendOncePerConversation: boolean;
};

const blank: FormState = {
  name: "",
  description: "",
  triggerKeywordsText: "",
  triggerRegexText: "",
  responseTemplate: "",
  literalResponse: false,
  mediaIds: [],
  nextStepAction: "stay",
  priority: 100,
  isActive: true,
  sendOncePerConversation: true,
};

function ObjectionsEditor({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const { data: items } = trpc.objections.list.useQuery({ agentId });
  const { data: medias } = trpc.media.list.useQuery({ agentId });

  const create = trpc.objections.create.useMutation({
    onSuccess: () => {
      utils.objections.list.invalidate({ agentId });
      setOpen(false);
      toast.success("Objeção criada");
    },
  });
  const update = trpc.objections.update.useMutation({
    onSuccess: () => utils.objections.list.invalidate({ agentId }),
  });
  const del = trpc.objections.delete.useMutation({
    onSuccess: () => {
      utils.objections.list.invalidate({ agentId });
      toast.success("Objeção removida");
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: number } | null>(null);
  const [form, setForm] = useState<FormState>(blank);

  const splitLines = (s: string): string[] =>
    s
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean);

  function openCreate() {
    setEditing(null);
    setForm(blank);
    setOpen(true);
  }

  function openEdit(o: any) {
    const parseList = (v: unknown): string => {
      if (!v) return "";
      if (Array.isArray(v)) return v.join("\n");
      if (typeof v === "string") {
        try {
          const a = JSON.parse(v);
          return Array.isArray(a) ? a.join("\n") : "";
        } catch {
          return "";
        }
      }
      return "";
    };
    setEditing(o);
    setForm({
      name: o.name,
      description: o.description ?? "",
      triggerKeywordsText: parseList(o.triggerKeywords),
      triggerRegexText: parseList(o.triggerRegex),
      responseTemplate: o.responseTemplate,
      literalResponse: !!o.literalResponse,
      mediaIds: Array.isArray(o.mediaIds)
        ? o.mediaIds
        : (() => {
            try {
              const a = JSON.parse(o.mediaIds || "[]");
              return Array.isArray(a) ? a : [];
            } catch {
              return [];
            }
          })(),
      nextStepAction: o.nextStepAction || "stay",
      priority: o.priority ?? 100,
      isActive: o.isActive ?? true,
      sendOncePerConversation: o.sendOncePerConversation ?? true,
    });
    setOpen(true);
  }

  function submit() {
    if (!form.name.trim() || !form.responseTemplate.trim()) {
      toast.error("Nome e resposta são obrigatórios");
      return;
    }
    const triggerKeywords = splitLines(form.triggerKeywordsText);
    if (triggerKeywords.length === 0) {
      toast.error("Adicione ao menos uma palavra-chave");
      return;
    }
    const triggerRegex = splitLines(form.triggerRegexText);
    const payload = {
      name: form.name,
      description: form.description.trim() || null,
      triggerKeywords,
      triggerRegex: triggerRegex.length > 0 ? triggerRegex : null,
      responseTemplate: form.responseTemplate,
      literalResponse: form.literalResponse,
      mediaIds: form.mediaIds.length > 0 ? form.mediaIds : null,
      nextStepAction: form.nextStepAction,
      priority: form.priority,
      isActive: form.isActive,
      sendOncePerConversation: form.sendOncePerConversation,
    };
    if (editing) {
      update.mutate(
        { id: editing.id, patch: payload },
        {
          onSuccess: () => {
            setOpen(false);
            toast.success("Objeção atualizada");
          },
        }
      );
    } else {
      create.mutate({ agentId, ...payload });
    }
  }

  const mediaOptions = useMemo(
    () =>
      (medias ?? []).map(m => ({ id: m.id, label: m.name || `mídia #${m.id}` })),
    [medias]
  );

  return (
    <div className="container py-10 max-w-4xl">
      <PageHeader
        eyebrow="Anti-alucinação"
        title="Objeções"
        description="Cadastre objeções comuns dos leads. Quando o agente detectar uma palavra-chave ou regex no inbound, ele responde com o template (literal ou como guia para o LLM) e pode anexar mídias específicas, sempre apenas 1x por conversa."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nova objeção
          </Button>
        }
      />

      {!items || items.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert className="h-5 w-5" />}
          title="Nenhuma objeção cadastrada"
          description='Sugestões: "preço alto", "não tenho tempo", "vou pensar", "preciso falar com meu sócio".'
          action={<Button onClick={openCreate}>Criar primeira objeção</Button>}
        />
      ) : (
        <div className="space-y-3">
          {items.map((o: any) => {
            const kws: string[] = Array.isArray(o.triggerKeywords)
              ? o.triggerKeywords
              : (() => {
                  try {
                    return JSON.parse(o.triggerKeywords || "[]");
                  } catch {
                    return [];
                  }
                })();
            return (
              <div key={o.id} className="elevated-card rounded-2xl p-5">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-amber-400/15 grid place-items-center text-amber-400 font-medium shrink-0">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium">{o.name}</h3>
                      {!o.isActive && (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          inativa
                        </span>
                      )}
                      {o.literalResponse && (
                        <span className="text-[10px] uppercase tracking-wider text-amber-400/90 bg-amber-400/10 px-1.5 py-0.5 rounded">
                          literal
                        </span>
                      )}
                      <span className="text-[10px] uppercase tracking-wider text-cyan-400/90 bg-cyan-400/10 px-1.5 py-0.5 rounded">
                        prio {o.priority}
                      </span>
                      {o.nextStepAction !== "stay" && (
                        <span className="text-[10px] uppercase tracking-wider text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded">
                          {o.nextStepAction === "advance" ? "avança etapa" : "reinicia"}
                        </span>
                      )}
                    </div>
                    {o.description && (
                      <p className="text-xs text-muted-foreground mt-1">{o.description}</p>
                    )}
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2 whitespace-pre-wrap">
                      {o.responseTemplate}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {kws.slice(0, 8).map((k: string) => (
                        <span
                          key={k}
                          className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                        >
                          {k}
                        </span>
                      ))}
                      {kws.length > 8 && (
                        <span className="text-[11px] text-muted-foreground">
                          +{kws.length - 8}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button size="sm" variant="outline" onClick={() => openEdit(o)}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm(`Remover objeção "${o.name}"?`)) del.mutate({ id: o.id });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar objeção" : "Nova objeção"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nome interno</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex.: Preço alto"
                />
              </div>
              <div>
                <Label>Prioridade (menor = vence)</Label>
                <Input
                  type="number"
                  min={0}
                  max={10000}
                  value={form.priority}
                  onChange={e =>
                    setForm({ ...form, priority: parseInt(e.target.value, 10) || 100 })
                  }
                />
              </div>
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Input
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Quando lead reclama do preço inicial"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Palavras-chave (uma por linha)</Label>
                <Textarea
                  rows={4}
                  value={form.triggerKeywordsText}
                  onChange={e => setForm({ ...form, triggerKeywordsText: e.target.value })}
                  placeholder={"caro\nmuito caro\nfora do orçamento\nnão tenho dinheiro"}
                  className="font-mono text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">Regex avançado (opcional, uma por linha)</Label>
                <Textarea
                  rows={4}
                  value={form.triggerRegexText}
                  onChange={e => setForm({ ...form, triggerRegexText: e.target.value })}
                  placeholder={"\\bn[ãa]o\\s+tenho\\s+(grana|dinheiro)\\b"}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div>
              <Label>Resposta (template ou texto literal)</Label>
              <Textarea
                rows={5}
                value={form.responseTemplate}
                onChange={e => setForm({ ...form, responseTemplate: e.target.value })}
                placeholder="Entendo. O preço parece alto à primeira vista, mas se você comparar com…"
              />
            </div>

            <div className="rounded-xl border border-border/60 p-4 space-y-3 bg-muted/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="cursor-pointer">Resposta literal</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Quando ativado, o agente envia a resposta exatamente como está acima, pulando o
                    LLM. Útil para preços, links e termos jurídicos.
                  </p>
                </div>
                <Switch
                  checked={form.literalResponse}
                  onCheckedChange={v => setForm({ ...form, literalResponse: v })}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="cursor-pointer">Disparar apenas 1x por conversa</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Garante idempotência: a mesma objeção não dispara duas vezes na mesma conversa.
                  </p>
                </div>
                <Switch
                  checked={form.sendOncePerConversation}
                  onCheckedChange={v => setForm({ ...form, sendOncePerConversation: v })}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="cursor-pointer">Ativa</Label>
                </div>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={v => setForm({ ...form, isActive: v })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Ação após responder</Label>
                <Select
                  value={form.nextStepAction}
                  onValueChange={(v: "stay" | "advance" | "restart") =>
                    setForm({ ...form, nextStepAction: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stay">Permanecer na etapa</SelectItem>
                    <SelectItem value="advance">Avançar para próxima etapa</SelectItem>
                    <SelectItem value="restart">Reiniciar etapa atual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Anexar mídias (opcional)</Label>
                <Select
                  value=""
                  onValueChange={v => {
                    const id = parseInt(v, 10);
                    if (!Number.isFinite(id)) return;
                    if (form.mediaIds.includes(id)) return;
                    setForm({ ...form, mediaIds: [...form.mediaIds, id] });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="+ adicionar mídia" />
                  </SelectTrigger>
                  <SelectContent>
                    {mediaOptions.map(m => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.mediaIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {form.mediaIds.map(mid => {
                      const m = mediaOptions.find(x => x.id === mid);
                      return (
                        <button
                          key={mid}
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              mediaIds: form.mediaIds.filter(x => x !== mid),
                            })
                          }
                          className="text-[11px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-destructive/20 hover:text-destructive"
                          title="Remover"
                        >
                          {m?.label || `#${mid}`} ×
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
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

import AppLayout from "@/components/AppLayout";
import { AgentRequired } from "@/components/AgentRequired";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import {
  Webhook,
  Plus,
  Copy,
  RotateCw,
  Trash2,
  Eye,
  EyeOff,
  RefreshCcw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const KNOWN_EVENTS = [
  { value: "purchase.completed", label: "Compra aprovada" },
  { value: "cart.abandoned", label: "Carrinho abandonado" },
  { value: "checkout.started", label: "Checkout iniciado" },
  { value: "payment.refused", label: "Pagamento recusado" },
  { value: "signup.completed", label: "Cadastro / boas-vindas" },
  { value: "subscription.cancelled", label: "Assinatura cancelada" },
  { value: "custom", label: "Customizado (definir abaixo)" },
];

const PLATFORMS = [
  "custom",
  "hotmart",
  "kiwify",
  "cakto",
  "monetizze",
  "eduzz",
  "shopify",
  "woocommerce",
  "activecampaign",
  "rdstation",
  "zapier",
  "make",
  "n8n",
];

type RuleAction =
  | { kind: "moveToStep"; stepId: number }
  | { kind: "setTemperature"; temperature: "hot" | "warm" | "cold" }
  | { kind: "addTag"; tag: string }
  | {
      kind: "sendMessage";
      mode: "free" | "fixed" | "template";
      text?: string;
      templateName?: string;
      prompt?: string;
      delayMinutes?: number;
    }
  | { kind: "pauseAi" }
  | { kind: "resumeAi" }
  | { kind: "handoff" }
  | { kind: "notifyOwner"; title?: string };

export default function ExternalEventsPage() {
  return (
    <AppLayout>
      <AgentRequired>{(agentId) => <Inner agentId={agentId} />}</AgentRequired>
    </AppLayout>
  );
}

function Inner({ agentId }: { agentId: number }) {
  return (
    <div className="container py-8 space-y-6">
      <PageHeader
        eyebrow="Integrações"
        title="Eventos Externos"
        description="Receba webhooks de plataformas externas (Hotmart, Shopify, Kiwify, etc.) para mover leads, recuperar carrinho abandonado, dar boas-vindas e mais — tudo via regras configuráveis."
      />

      <Tabs defaultValue="sources" className="space-y-6">
        <TabsList>
          <TabsTrigger value="sources">Fontes (Webhooks)</TabsTrigger>
          <TabsTrigger value="rules">Regras</TabsTrigger>
          <TabsTrigger value="log">Log de eventos</TabsTrigger>
        </TabsList>

        <TabsContent value="sources">
          <SourcesTab agentId={agentId} />
        </TabsContent>
        <TabsContent value="rules">
          <RulesTab agentId={agentId} />
        </TabsContent>
        <TabsContent value="log">
          <LogTab agentId={agentId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ================================================================
 * SOURCES
 * ================================================================ */
function SourcesTab({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const { data: sources } = trpc.externalEvents.listSources.useQuery({ agentId });
  const create = trpc.externalEvents.createSource.useMutation({
    onSuccess: () => {
      utils.externalEvents.listSources.invalidate({ agentId });
      toast.success("Fonte criada");
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.externalEvents.updateSource.useMutation({
    onSuccess: () => utils.externalEvents.listSources.invalidate({ agentId }),
  });
  const rotate = trpc.externalEvents.rotateSecret.useMutation({
    onSuccess: () => {
      utils.externalEvents.listSources.invalidate({ agentId });
      toast.success("Secret rotacionado");
    },
  });
  const del = trpc.externalEvents.deleteSource.useMutation({
    onSuccess: () => {
      utils.externalEvents.listSources.invalidate({ agentId });
      toast.success("Fonte removida");
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", platform: "custom", notes: "" });
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  const list = sources ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Cada fonte gera uma URL de webhook própria com secret HMAC. Cole essa URL na
          plataforma externa (Hotmart, Shopify, etc.) para começar a receber eventos.
        </p>
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4 mr-1" /> Nova fonte
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="Nenhuma fonte cadastrada"
          description="Crie a primeira fonte para receber webhooks de uma plataforma externa."
          icon={<Webhook className="size-6" />}
        />
      ) : (
        <div className="space-y-3">
          {list.map((s) => (
            <SourceCard
              key={s.id}
              source={s}
              agentId={agentId}
              revealed={!!revealed[s.id]}
              onToggleReveal={() =>
                setRevealed((r) => ({ ...r, [s.id]: !r[s.id] }))
              }
              onToggleEnabled={(enabled) =>
                update.mutate({ id: s.id, agentId, patch: { enabled } })
              }
              onRotate={() => rotate.mutate({ id: s.id, agentId })}
              onDelete={() => {
                if (confirm(`Remover "${s.name}"? Os eventos no log são preservados.`)) {
                  del.mutate({ id: s.id, agentId });
                }
              }}
            />
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova fonte de eventos</DialogTitle>
            <DialogDescription>
              O slug será parte da URL pública e não pode ser alterado depois.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Hotmart Curso XYZ"
              />
            </div>
            <div>
              <Label>Slug (ex: hotmart-curso-xyz)</Label>
              <Input
                value={form.slug}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    slug: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, "-")
                      .replace(/-+/g, "-"),
                  }))
                }
                placeholder="hotmart-curso-xyz"
              />
            </div>
            <div>
              <Label>Plataforma</Label>
              <Select
                value={form.platform}
                onValueChange={(v) => setForm((f) => ({ ...f, platform: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notas (opcional)</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Para que serve esta fonte"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                create.mutate({
                  agentId,
                  name: form.name,
                  slug: form.slug,
                  platform: form.platform,
                  notes: form.notes || null,
                })
              }
              disabled={!form.name || form.slug.length < 3 || create.isPending}
            >
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SourceCard({
  source,
  revealed,
  onToggleReveal,
  onToggleEnabled,
  onRotate,
  onDelete,
}: {
  source: any;
  agentId: number;
  revealed: boolean;
  onToggleReveal: () => void;
  onToggleEnabled: (v: boolean) => void;
  onRotate: () => void;
  onDelete: () => void;
}) {
  const url = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/api/external-events/${source.slug}`;
  }, [source.slug]);

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{source.name}</h3>
            <Badge variant="outline">{source.platform}</Badge>
            {!source.enabled && <Badge variant="destructive">desabilitado</Badge>}
          </div>
          {source.notes && (
            <p className="text-xs text-muted-foreground">{source.notes}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={!!source.enabled} onCheckedChange={onToggleEnabled} />
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <Label className="text-xs">URL do webhook (cole na plataforma)</Label>
          <div className="flex gap-2 mt-1">
            <Input value={url} readOnly className="font-mono text-xs" />
            <Button size="sm" variant="outline" onClick={() => copy(url, "URL")}>
              <Copy className="size-3" />
            </Button>
          </div>
        </div>
        <div>
          <Label className="text-xs">
            Secret HMAC (envie no header <code>X-Signature: sha256=&lt;hex&gt;</code>)
          </Label>
          <div className="flex gap-2 mt-1">
            <Input
              value={revealed ? source.secret : "•".repeat(20)}
              readOnly
              className="font-mono text-xs"
            />
            <Button size="sm" variant="outline" onClick={onToggleReveal}>
              {revealed ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copy(source.secret, "Secret")}
            >
              <Copy className="size-3" />
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" onClick={onRotate}>
                  <RotateCw className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Gerar novo secret</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center pt-2 border-t">
        <p className="text-xs text-muted-foreground">
          ID #{source.id} · criada em {new Date(source.createdAt).toLocaleString("pt-BR")}
        </p>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          <Trash2 className="size-3 mr-1" /> Remover
        </Button>
      </div>
    </div>
  );
}

/* ================================================================
 * RULES
 * ================================================================ */
function RulesTab({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const { data: rules } = trpc.externalEvents.listRules.useQuery({ agentId });
  const { data: sources } = trpc.externalEvents.listSources.useQuery({ agentId });
  const { data: steps } = trpc.steps.list.useQuery({ agentId });
  const upsert = trpc.externalEvents.upsertRule.useMutation({
    onSuccess: () => {
      utils.externalEvents.listRules.invalidate({ agentId });
      toast.success("Regra salva");
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.externalEvents.deleteRule.useMutation({
    onSuccess: () => {
      utils.externalEvents.listRules.invalidate({ agentId });
      toast.success("Regra removida");
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(rule: any) {
    setEditing(rule);
    setOpen(true);
  }

  const list = rules ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Cada regra define o que acontece quando um tipo de evento chega.
          Ações são executadas em sequência.
        </p>
        <Button onClick={openCreate} disabled={(sources ?? []).length === 0}>
          <Plus className="size-4 mr-1" /> Nova regra
        </Button>
      </div>

      {(sources ?? []).length === 0 && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 text-sm text-amber-600">
          Crie pelo menos uma <strong>fonte</strong> antes de configurar regras.
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState
          title="Nenhuma regra ativa"
          description="Crie regras para reagir a compras, carrinhos abandonados, novos cadastros, etc."
          icon={<Webhook className="size-6" />}
        />
      ) : (
        <div className="space-y-3">
          {list.map((r) => (
            <RuleCard
              key={r.id}
              rule={r}
              sources={sources ?? []}
              steps={steps ?? []}
              onEdit={() => openEdit(r)}
              onToggle={(enabled) =>
                upsert.mutate({
                  id: r.id,
                  agentId,
                  sourceId: r.sourceId,
                  eventType: r.eventType,
                  name: r.name,
                  description: r.description,
                  actions: (r.actions ?? [{ kind: "v2" }]) as unknown as any[],
                  enabled,
                  createLeadIfMissing: r.createLeadIfMissing,
                  priority: r.priority,
                  channelAgentId: r.channelAgentId ?? null,
                  templateId: r.templateId ?? null,
                  delayMinutes: r.delayMinutes ?? 0,
                  moveToStepId: r.moveToStepId ?? null,
                  tagLabel: r.tagLabel ?? null,
                  aiContext: r.aiContext ?? null,
                  isActive: r.isActive ?? true,
                })
              }
              onDelete={() => {
                if (confirm(`Remover regra "${r.name}"?`)) {
                  del.mutate({ id: r.id, agentId });
                }
              }}
            />
          ))}
        </div>
      )}

      <RuleEditorDialog
        open={open}
        onOpenChange={setOpen}
        agentId={agentId}
        editing={editing}
        sources={sources ?? []}
        steps={steps ?? []}
        onSave={(data) => upsert.mutate(data)}
        saving={upsert.isPending}
      />
    </div>
  );
}

function RuleCard({
  rule,
  sources,
  steps,
  onEdit,
  onToggle,
  onDelete,
}: {
  rule: any;
  sources: any[];
  steps: any[];
  onEdit: () => void;
  onToggle: (v: boolean) => void;
  onDelete: () => void;
}) {
  const sourceLabel = rule.sourceId
    ? sources.find((s) => s.id === rule.sourceId)?.name ?? `#${rule.sourceId}`
    : "qualquer fonte";

  // Detecção de regra v2 (campos diretos)
  const isV2 =
    rule.templateId != null ||
    rule.moveToStepId != null ||
    !!rule.tagLabel ||
    !!rule.aiContext ||
    !!rule.channelAgentId;

  const ruleActions = (rule.actions ?? []) as unknown as RuleAction[];
  function actionSummary(a: RuleAction): string {
    switch (a.kind) {
      case "moveToStep": {
        const st = steps.find((s) => s.id === a.stepId);
        return `Mover para etapa ${st?.name ?? `#${a.stepId}`}`;
      }
      case "setTemperature":
        return `Temperatura → ${a.temperature}`;
      case "addTag":
        return `Adicionar tag "${a.tag}"`;
      case "sendMessage": {
        const delay = a.delayMinutes ? ` (em ${a.delayMinutes} min)` : "";
        if (a.mode === "free") return `Enviar mensagem gerada por IA${delay}`;
        if (a.mode === "fixed") return `Enviar texto fixo${delay}`;
        return `Enviar template "${a.templateName ?? "?"}"${delay}`;
      }
      case "pauseAi":
        return "Pausar IA";
      case "resumeAi":
        return "Despausar IA";
      case "handoff":
        return "Handoff humano";
      case "notifyOwner":
        return "Notificar dono";
      default:
        return JSON.stringify(a);
    }
  }

  function v2Summary(): string[] {
    const out: string[] = [];
    if (rule.delayMinutes && rule.delayMinutes > 0) {
      out.push(`Aguardar ${rule.delayMinutes} min antes de executar`);
    }
    if (rule.templateId && rule.channelAgentId) {
      out.push(`Disparar template (canal #${rule.channelAgentId})`);
    }
    if (rule.moveToStepId) {
      const st = steps.find((s) => s.id === rule.moveToStepId);
      out.push(`Mover para etapa ${st?.name ?? `#${rule.moveToStepId}`}`);
    }
    if (rule.tagLabel) out.push(`Associar tag “${rule.tagLabel}”`);
    if (rule.aiContext) out.push(`Contexto IA: “${String(rule.aiContext).slice(0, 80)}”`);
    if (out.length === 0) out.push("(sem ações definidas)");
    return out;
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold">{rule.name}</h3>
            <Badge variant="outline">{rule.eventType}</Badge>
            <Badge variant="secondary">{sourceLabel}</Badge>
            {!rule.enabled && <Badge variant="destructive">desabilitada</Badge>}
            {isV2 && rule.isActive === false && (
              <Badge variant="destructive">inativa</Badge>
            )}
            {rule.createLeadIfMissing && (
              <Badge variant="outline" className="text-emerald-600 border-emerald-600/40">
                cria lead se faltar
              </Badge>
            )}
          </div>
          {rule.description && (
            <p className="text-xs text-muted-foreground mt-1">{rule.description}</p>
          )}
        </div>
        <Switch checked={!!rule.enabled} onCheckedChange={onToggle} />
      </div>
      <ul className="text-sm space-y-1 pl-4 list-disc">
        {isV2
          ? v2Summary().map((s, i) => <li key={i}>{s}</li>)
          : ruleActions.map((a, i) => <li key={i}>{actionSummary(a)}</li>)}
      </ul>
      <div className="flex justify-between items-center pt-2 border-t">
        <p className="text-xs text-muted-foreground">
          Prioridade {rule.priority} · ID #{rule.id}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>
            Editar
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 className="size-3 mr-1" /> Remover
          </Button>
        </div>
      </div>
    </div>
  );
}

function RuleEditorDialog({
  open,
  onOpenChange,
  agentId,
  editing,
  sources,
  steps,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agentId: number;
  editing: any | null;
  sources: any[];
  steps: any[];
  onSave: (data: any) => void;
  saving: boolean;
}) {
  // Campos básicos da regra
  const [name, setName] = useState("");
  const [eventType, setEventType] = useState("purchase.completed");
  const [customEventType, setCustomEventType] = useState("");
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [createLead, setCreateLead] = useState(true);
  const [priority, setPriority] = useState(100);

  // Campos do editor v2 (mock "Editar Link")
  const [channelAgentId, setChannelAgentId] = useState<number | null>(null);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [delayMinutes, setDelayMinutes] = useState<number>(1);
  const [moveToStepId, setMoveToStepId] = useState<number | null>(null);
  const [tagLabel, setTagLabel] = useState<string>("");
  const [aiContext, setAiContext] = useState<string>("");
  const [isActive, setIsActive] = useState<boolean>(true);

  // Reset / preencher quando abre
  useMemo(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      const knownEv = KNOWN_EVENTS.some((k) => k.value === editing.eventType);
      setEventType(knownEv ? editing.eventType : "custom");
      setCustomEventType(knownEv ? "" : editing.eventType);
      setSourceId(editing.sourceId);
      setDescription(editing.description ?? "");
      setEnabled(!!editing.enabled);
      setCreateLead(!!editing.createLeadIfMissing);
      setPriority(editing.priority);
      setChannelAgentId(editing.channelAgentId ?? null);
      setTemplateId(editing.templateId ?? null);
      setDelayMinutes(editing.delayMinutes ?? 0);
      setMoveToStepId(editing.moveToStepId ?? null);
      setTagLabel(editing.tagLabel ?? "");
      setAiContext(editing.aiContext ?? "");
      setIsActive(editing.isActive ?? true);
    } else {
      setName("");
      setEventType("purchase.completed");
      setCustomEventType("");
      setSourceId(null);
      setDescription("");
      setEnabled(true);
      setCreateLead(true);
      setPriority(100);
      setChannelAgentId(null);
      setTemplateId(null);
      setDelayMinutes(1);
      setMoveToStepId(null);
      setTagLabel("");
      setAiContext("");
      setIsActive(true);
    }
  }, [open, editing]);

  // Carrega canais oficiais (Cloud API) e templates do canal escolhido
  const { data: channels } = trpc.externalEvents.listChannels.useQuery(
    { agentId },
    { enabled: open },
  );
  const { data: templates, isLoading: tplLoading, isError: tplError } =
    trpc.externalEvents.listChannelTemplates.useQuery(
      { channelAgentId: channelAgentId ?? 0 },
      { enabled: open && channelAgentId != null },
    );

  // Quando troca o canal, limpa template selecionado
  function changeChannel(v: string) {
    const next = v === "none" ? null : Number(v);
    setChannelAgentId(next);
    setTemplateId(null);
  }

  // URL do webhook — derivada da fonte (sourceId). Mantém o modelo: cada
  // fonte tem sua URL própria. Se nenhuma fonte selecionada, mostra hint.
  const webhookUrl = useMemo(() => {
    if (!sourceId) return "";
    const src = sources.find((s) => s.id === sourceId);
    if (!src) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/api/external-events/${src.slug}`;
  }, [sourceId, sources]);

  const utils = trpc.useUtils();
  const rotate = trpc.externalEvents.rotateSecret.useMutation({
    onSuccess: () => {
      utils.externalEvents.listSources.invalidate({ agentId });
      toast.success("Secret rotacionado");
    },
  });

  function copy(text: string, label: string) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
  }

  const finalEventType = eventType === "custom" ? customEventType.trim() : eventType;
  const canSave = name.length >= 2 && finalEventType.length >= 1;

  function submit() {
    onSave({
      id: editing?.id,
      agentId,
      sourceId,
      eventType: finalEventType,
      name,
      description: description || null,
      // mantemos um marker no JSON `actions` para não quebrar a constraint legacy
      actions: [{ kind: "v2" }],
      enabled,
      createLeadIfMissing: createLead,
      priority,
      channelAgentId,
      templateId,
      delayMinutes: Math.max(0, Number(delayMinutes) || 0),
      moveToStepId,
      tagLabel: tagLabel.trim() ? tagLabel.trim() : null,
      aiContext: aiContext.trim() ? aiContext.trim() : null,
      isActive,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-primary/15 flex items-center justify-center">
              <Webhook className="size-5 text-primary" />
            </div>
            <div>
              <DialogTitle>{editing ? "Editar Link" : "Novo Link"}</DialogTitle>
              <DialogDescription>
                Configure o template e canal para disparar via webhook
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Nome / Evento / Fonte (campos contextuais) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nome da regra</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Anuncio Black Friday"
              />
            </div>
            <div>
              <Label>Tipo de evento</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KNOWN_EVENTS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {eventType === "custom" && (
                <Input
                  className="mt-2"
                  value={customEventType}
                  onChange={(e) => setCustomEventType(e.target.value.slice(0, 80))}
                  placeholder="ex: order.shipped"
                />
              )}
            </div>
          </div>

          <div>
            <Label>Aplicar à fonte</Label>
            <Select
              value={sourceId == null ? "any" : String(sourceId)}
              onValueChange={(v) => setSourceId(v === "any" ? null : Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Qualquer fonte</SelectItem>
                {sources.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Canal (Cloud API) */}
          <div>
            <Label className="flex items-center gap-2">
              <RefreshCcw className="size-3.5" /> Canal
            </Label>
            <Select
              value={channelAgentId == null ? "none" : String(channelAgentId)}
              onValueChange={changeChannel}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um canal Cloud API" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não disparar template</SelectItem>
                {(channels ?? []).map((c) => (
                  <SelectItem key={c.agentId} value={String(c.agentId)}>
                    {c.name}
                    {c.displayPhoneNumber ? ` · ${c.displayPhoneNumber}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {channels && channels.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                Nenhum canal Cloud API conectado. Conecte um agente em modo oficial em Agentes &rarr; WhatsApp.
              </p>
            )}
          </div>

          {/* Template */}
          <div>
            <Label>Template</Label>
            <Select
              value={templateId == null ? "none" : String(templateId)}
              onValueChange={(v) =>
                setTemplateId(v === "none" ? null : Number(v))
              }
              disabled={channelAgentId == null}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    channelAgentId == null
                      ? "Selecione um canal primeiro"
                      : tplLoading
                        ? "Carregando templates..."
                        : "Selecione um template aprovado"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {(templates ?? []).map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name} · {t.languageCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tplError && (
              <p className="text-xs text-destructive mt-1">
                Não foi possível carregar templates. Verifique o canal.
              </p>
            )}
            {channelAgentId != null &&
              !tplLoading &&
              !tplError &&
              (templates ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Este canal não tem templates aprovados.
                </p>
              )}
          </div>

          {/* Aguardar */}
          <div className="flex items-center gap-3">
            <Label className="flex items-center gap-2 mb-0">
              <Clock className="size-3.5" /> Aguardar
            </Label>
            <Input
              type="number"
              min={0}
              max={1440}
              value={delayMinutes}
              onChange={(e) =>
                setDelayMinutes(Math.max(0, Number(e.target.value) || 0))
              }
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">
              min antes de executar
            </span>
          </div>

          {/* Mover para */}
          <div>
            <Label>Mover para</Label>
            <Select
              value={moveToStepId == null ? "none" : String(moveToStepId)}
              onValueChange={(v) =>
                setMoveToStepId(v === "none" ? null : Number(v))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma etapa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não mover</SelectItem>
                {steps.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Associar tag */}
          <div>
            <Label>Associar tag</Label>
            <Input
              value={tagLabel}
              onChange={(e) => setTagLabel(e.target.value.slice(0, 80))}
              placeholder="Nenhuma"
            />
          </div>

          {/* Contexto IA */}
          <div>
            <Label>Contexto IA</Label>
            <Textarea
              rows={2}
              value={aiContext}
              onChange={(e) => setAiContext(e.target.value.slice(0, 4000))}
              placeholder="Ex: Clicou no anúncio da campanha X"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Esse texto entra no próximo prompt da IA quando o lead responder.
            </p>
          </div>

          {/* Ativo */}
          <div className="flex items-center justify-between border-t pt-4">
            <Label className="mb-0">Ativo</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {/* URL do Webhook */}
          <div className="border-t pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 mb-0">
                <Webhook className="size-3.5" /> URL do Webhook
              </Label>
              <Button
                size="sm"
                variant="ghost"
                disabled={!sourceId || rotate.isPending}
                onClick={() =>
                  sourceId && rotate.mutate({ id: sourceId, agentId })
                }
              >
                <RotateCw className="size-3 mr-1" /> Regenerar
              </Button>
            </div>
            <Input
              readOnly
              value={webhookUrl}
              placeholder="Selecione uma fonte para gerar a URL"
              className="font-mono text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={!webhookUrl}
              onClick={() => copy(webhookUrl, "URL")}
            >
              <Copy className="size-3 mr-1" /> Copiar URL
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Regenerar troca o secret HMAC da fonte (não muda a URL).
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!canSave || saving}>
            {editing ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActionAddButton({ onAdd }: { onAdd: (a: RuleAction) => void }) {
  return (
    <Select
      value=""
      onValueChange={(v) => {
        switch (v) {
          case "sendMessage_free":
            onAdd({ kind: "sendMessage", mode: "free", prompt: "" });
            break;
          case "sendMessage_fixed":
            onAdd({ kind: "sendMessage", mode: "fixed", text: "" });
            break;
          case "moveToStep":
            onAdd({ kind: "moveToStep", stepId: 0 });
            break;
          case "setTemperature":
            onAdd({ kind: "setTemperature", temperature: "hot" });
            break;
          case "addTag":
            onAdd({ kind: "addTag", tag: "" });
            break;
          case "pauseAi":
            onAdd({ kind: "pauseAi" });
            break;
          case "resumeAi":
            onAdd({ kind: "resumeAi" });
            break;
          case "handoff":
            onAdd({ kind: "handoff" });
            break;
          case "notifyOwner":
            onAdd({ kind: "notifyOwner" });
            break;
        }
      }}
    >
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="+ Adicionar ação" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="sendMessage_free">Enviar mensagem (IA gera)</SelectItem>
        <SelectItem value="sendMessage_fixed">Enviar mensagem (texto fixo)</SelectItem>
        <SelectItem value="moveToStep">Mover para etapa do script</SelectItem>
        <SelectItem value="setTemperature">Mudar temperatura</SelectItem>
        <SelectItem value="addTag">Adicionar tag</SelectItem>
        <SelectItem value="pauseAi">Pausar IA</SelectItem>
        <SelectItem value="resumeAi">Despausar IA</SelectItem>
        <SelectItem value="handoff">Handoff humano</SelectItem>
        <SelectItem value="notifyOwner">Notificar dono</SelectItem>
      </SelectContent>
    </Select>
  );
}

function ActionEditor({
  action,
  steps,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  action: RuleAction;
  steps: any[];
  onChange: (a: RuleAction) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <div className="rounded-md border p-3 space-y-2 bg-muted/20">
      <div className="flex justify-between items-center">
        <Badge variant="outline">{labelFor(action)}</Badge>
        <div className="flex gap-1">
          {onMoveUp && (
            <Button size="sm" variant="ghost" onClick={onMoveUp}>
              ↑
            </Button>
          )}
          {onMoveDown && (
            <Button size="sm" variant="ghost" onClick={onMoveDown}>
              ↓
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onRemove}>
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>

      {action.kind === "sendMessage" && (
        <div className="space-y-2">
          {action.mode === "free" ? (
            <div>
              <Label className="text-xs">Instrução para a IA</Label>
              <Textarea
                rows={3}
                value={action.prompt ?? ""}
                onChange={(e) => onChange({ ...action, prompt: e.target.value })}
                placeholder="Ex: agradeça pela compra, pergunte se já recebeu o acesso e ofereça suporte."
              />
            </div>
          ) : (
            <div>
              <Label className="text-xs">
                Texto fixo (variáveis: <code>{"{{name}}"}</code>,{" "}
                <code>{"{{phone}}"}</code>, <code>{"{{payload.x}}"}</code>)
              </Label>
              <Textarea
                rows={3}
                value={action.text ?? ""}
                onChange={(e) => onChange({ ...action, text: e.target.value })}
                placeholder="Olá {{name}}, sua compra foi aprovada! 🎉"
              />
            </div>
          )}
          <div>
            <Label className="text-xs">Atraso (min, 0 = imediato)</Label>
            <Input
              type="number"
              min={0}
              max={1440}
              value={action.delayMinutes ?? 0}
              onChange={(e) =>
                onChange({ ...action, delayMinutes: Math.max(0, Number(e.target.value)) })
              }
              className="w-32"
            />
          </div>
        </div>
      )}

      {action.kind === "moveToStep" && (
        <div>
          <Label className="text-xs">Etapa</Label>
          <Select
            value={action.stepId ? String(action.stepId) : ""}
            onValueChange={(v) => onChange({ ...action, stepId: Number(v) })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Escolha…" />
            </SelectTrigger>
            <SelectContent>
              {steps.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {action.kind === "setTemperature" && (
        <div>
          <Label className="text-xs">Temperatura</Label>
          <Select
            value={action.temperature}
            onValueChange={(v) =>
              onChange({ ...action, temperature: v as "hot" | "warm" | "cold" })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hot">Quente</SelectItem>
              <SelectItem value="warm">Morno</SelectItem>
              <SelectItem value="cold">Frio</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {action.kind === "addTag" && (
        <div>
          <Label className="text-xs">Tag</Label>
          <Input
            value={action.tag}
            onChange={(e) => onChange({ ...action, tag: e.target.value })}
            placeholder="comprou-curso-x"
          />
        </div>
      )}

      {action.kind === "notifyOwner" && (
        <div>
          <Label className="text-xs">Título da notificação (opcional)</Label>
          <Input
            value={action.title ?? ""}
            onChange={(e) => onChange({ ...action, title: e.target.value })}
            placeholder="Nova compra aprovada"
          />
        </div>
      )}
    </div>
  );
}

function labelFor(a: RuleAction): string {
  switch (a.kind) {
    case "sendMessage":
      return a.mode === "free"
        ? "Enviar mensagem (IA)"
        : a.mode === "fixed"
        ? "Enviar texto fixo"
        : "Enviar template";
    case "moveToStep":
      return "Mover etapa";
    case "setTemperature":
      return "Mudar temperatura";
    case "addTag":
      return "Adicionar tag";
    case "pauseAi":
      return "Pausar IA";
    case "resumeAi":
      return "Despausar IA";
    case "handoff":
      return "Handoff humano";
    case "notifyOwner":
      return "Notificar dono";
  }
}

/* ================================================================
 * LOG
 * ================================================================ */
function LogTab({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<string>("any");
  const { data: events, isLoading } = trpc.externalEvents.listEvents.useQuery({
    agentId,
    status: statusFilter === "any" ? undefined : (statusFilter as any),
    limit: 100,
  });
  const retry = trpc.externalEvents.retryEvent.useMutation({
    onSuccess: () => {
      utils.externalEvents.listEvents.invalidate({ agentId });
      toast.success("Evento reprocessado");
    },
    onError: (e) => toast.error(e.message),
  });

  const list = events ?? [];

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Todos os status</SelectItem>
            <SelectItem value="received">Recebido</SelectItem>
            <SelectItem value="processed">Processado</SelectItem>
            <SelectItem value="ignored">Ignorado</SelectItem>
            <SelectItem value="unmatched">Sem lead</SelectItem>
            <SelectItem value="failed">Falhou</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => utils.externalEvents.listEvents.invalidate({ agentId })}
        >
          <RefreshCcw className="size-3 mr-1" /> Atualizar
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!isLoading && list.length === 0 && (
        <EmptyState
          title="Nenhum evento ainda"
          description="Quando uma plataforma externa enviar um webhook, ele aparecerá aqui."
          icon={<Webhook className="size-6" />}
        />
      )}

      <div className="space-y-2">
        {list.map((ev: any) => (
          <EventRow key={ev.id} ev={ev} onRetry={() => retry.mutate({ id: ev.id, agentId })} />
        ))}
      </div>
    </div>
  );
}

function EventRow({ ev, onRetry }: { ev: any; onRetry: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const Icon =
    ev.status === "processed"
      ? CheckCircle2
      : ev.status === "failed"
      ? XCircle
      : ev.status === "ignored" || ev.status === "unmatched"
      ? AlertCircle
      : Clock;
  const color =
    ev.status === "processed"
      ? "text-emerald-600"
      : ev.status === "failed"
      ? "text-red-600"
      : ev.status === "ignored" || ev.status === "unmatched"
      ? "text-amber-600"
      : "text-blue-600";
  return (
    <div className="rounded-md border bg-card p-3 text-sm space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`size-4 ${color}`} />
          <Badge variant="outline">{ev.eventType}</Badge>
          <Badge variant="secondary">{ev.status}</Badge>
          {ev.leadIdentifier && (
            <span className="text-xs text-muted-foreground">
              {ev.leadIdentifier}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{new Date(ev.receivedAt).toLocaleString("pt-BR")}</span>
          <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "ocultar" : "ver"}
          </Button>
          {(ev.status === "failed" || ev.status === "unmatched") && (
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RotateCw className="size-3 mr-1" /> Reprocessar
            </Button>
          )}
        </div>
      </div>
      {ev.errorMessage && (
        <p className="text-xs text-red-500">{ev.errorMessage}</p>
      )}
      {expanded && (
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Payload</Label>
            <pre className="text-xs bg-muted/50 p-2 rounded overflow-auto max-h-64">
              {JSON.stringify(ev.payload, null, 2)}
            </pre>
          </div>
          {ev.actionsApplied && (
            <div>
              <Label className="text-xs">Ações aplicadas</Label>
              <pre className="text-xs bg-muted/50 p-2 rounded overflow-auto max-h-64">
                {JSON.stringify(ev.actionsApplied, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

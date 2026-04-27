import AppLayout from "@/components/AppLayout";
import { AgentRequired } from "@/components/AgentRequired";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { Save, ShieldOff, X, Plus, UserCheck, Lock, Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function BrainPage() {
  return (
    <AppLayout>
      <AgentRequired>{agentId => <BrainEditor agentId={agentId} />}</AgentRequired>
    </AppLayout>
  );
}

function BrainEditor({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.brain.get.useQuery({ agentId });
  const save = trpc.brain.save.useMutation({
    onSuccess: async () => {
      await utils.brain.get.invalidate({ agentId });
      toast.success("Cérebro salvo");
    },
  });

  const [form, setForm] = useState({
    masterPrompt: "",
    tone: "",
    rules: "",
    products: "",
    objections: "",
    companyInfo: "",
  });

  useEffect(() => {
    if (data) {
      setForm({
        masterPrompt: data.masterPrompt ?? "",
        tone: data.tone ?? "",
        rules: data.rules ?? "",
        products: data.products ?? "",
        objections: data.objections ?? "",
        companyInfo: data.companyInfo ?? "",
      });
    }
  }, [data]);

  const fields: Array<{
    key: keyof typeof form;
    label: string;
    placeholder: string;
    rows: number;
    description: string;
  }> = [
    {
      key: "masterPrompt",
      label: "Prompt mestre",
      rows: 8,
      placeholder:
        "Você é um agente de vendas representando a empresa X. Sua missão é qualificar leads e agendar uma demonstração...",
      description:
        "Texto principal que define identidade, missão e diretrizes gerais. O agente é instruído a NUNCA sair daqui.",
    },
    {
      key: "tone",
      label: "Tom de voz",
      rows: 3,
      placeholder: "Acolhedor, direto, sem gírias, máximo 2 frases por mensagem.",
      description: "Como o agente deve soar.",
    },
    {
      key: "rules",
      label: "Regras estritas",
      rows: 6,
      placeholder:
        "- Nunca prometer prazos. - Não falar de concorrentes. - Sempre pedir o WhatsApp do decisor.",
      description: "Regras inegociáveis (uma por linha).",
    },
    {
      key: "products",
      label: "Produtos / Serviços",
      rows: 6,
      placeholder: "Plano Starter R$ 99/mês — até 3 usuários...",
      description: "Cardápio do que o agente pode oferecer.",
    },
    {
      key: "objections",
      label: "Objeções comuns e respostas",
      rows: 6,
      placeholder: "Está caro: lembrar do ROI em X meses...",
      description: "Roteiro para superar objeções.",
    },
    {
      key: "companyInfo",
      label: "Informações da empresa",
      rows: 5,
      placeholder: "Fundada em 2018, sede em SP, mais de 1.000 clientes...",
      description: "Contexto que o agente pode citar.",
    },
  ];

  return (
    <div className="container py-10 max-w-4xl">
      <PageHeader
        eyebrow="Configuração"
        title="Cérebro do agente"
        description="Tudo que está aqui é o ÚNICO contexto que o agente pode usar. Ele é instruído a não inventar nada fora dessas instruções."
        actions={
          <Button onClick={() => save.mutate({ agentId, ...form })} disabled={save.isPending}>
            <Save className="h-4 w-4 mr-1.5" />
            Salvar cérebro
          </Button>
        }
      />
      <div className="space-y-6">
        {isLoading ? (
          <div className="elevated-card rounded-2xl h-40 animate-pulse" />
        ) : (
          fields.map(f => (
            <div key={f.key} className="elevated-card rounded-2xl p-6">
              <MarkdownEditor
                label={f.label}
                description={f.description}
                placeholder={f.placeholder}
                rows={f.rows}
                value={form[f.key]}
                onChange={next => setForm({ ...form, [f.key]: next })}
                compact={f.rows <= 3}
              />
            </div>
          ))
        )}
        <RestrictedTermsSection agentId={agentId} />
        <LeadStatusRulesSection agentId={agentId} />
      </div>
    </div>
  );
}

function LeadStatusRulesSection({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const { data: rules } = trpc.leadStatusRules.list.useQuery({ agentId });
  const create = trpc.leadStatusRules.create.useMutation({
    onSuccess: () => {
      utils.leadStatusRules.list.invalidate({ agentId });
      setOpen(false);
      setForm(emptyForm);
      toast.success("Regra criada");
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.leadStatusRules.update.useMutation({
    onSuccess: () => {
      utils.leadStatusRules.list.invalidate({ agentId });
      toast.success("Regra atualizada");
    },
  });
  const remove = trpc.leadStatusRules.remove.useMutation({
    onSuccess: () => utils.leadStatusRules.list.invalidate({ agentId }),
  });

  const emptyForm = {
    slug: "",
    label: "",
    description: "",
    isBlocking: true,
    replyWhenBlocked: "",
    handoffOnMatch: true,
    notifyOwnerOnMatch: true,
  };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  return (
    <div className="elevated-card rounded-2xl p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-amber-500/15 grid place-items-center text-amber-400 shrink-0">
          <UserCheck className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <Label className="text-sm">Status automático do lead</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            A IA analisa cada mensagem do lead e, se identificar uma das
            situações abaixo (ex.: “já sou aluno”, “sou afiliado”, “pedi
            reembolso”), atribui a tag correspondente. Regras marcadas como
            <b> bloqueantes</b> travam o atendimento: o agente envia a
            mensagem padrão definida aqui, pausa a IA e (opcionalmente)
            encaminha pra humano + notifica você.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setForm(emptyForm);
            setOpen(!open);
          }}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Nova regra
        </Button>
      </div>

      {open && (
        <div className="rounded-xl border border-border/60 p-4 space-y-3 bg-muted/30">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Slug (identificador técnico)</Label>
              <Input
                value={form.slug}
                onChange={e =>
                  setForm({
                    ...form,
                    slug: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_]/g, "_")
                      .slice(0, 80),
                  })
                }
                placeholder="membro_wedrop"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Apenas letras minúsculas, números e underscore. Ex.: membro_wedrop
              </p>
            </div>
            <div>
              <Label className="text-xs">Rótulo (exibido na UI)</Label>
              <Input
                value={form.label}
                onChange={e => setForm({ ...form, label: e.target.value })}
                placeholder="Já é membro WeDrop"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Descrição (a IA usa para detectar)</Label>
            <Textarea
              rows={3}
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Lead menciona que já é aluno, já comprou, já tem acesso à plataforma, já está na WeDrop, é membro, etc."
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={form.isBlocking}
              onCheckedChange={v => setForm({ ...form, isBlocking: v })}
            />
            <span className="text-sm">Bloquear atendimento ao detectar</span>
          </div>
          {form.isBlocking && (
            <>
              <div>
                <Label className="text-xs">Mensagem padrão enviada ao lead</Label>
                <Textarea
                  rows={3}
                  value={form.replyWhenBlocked}
                  onChange={e => setForm({ ...form, replyWhenBlocked: e.target.value })}
                  placeholder="Opa! Vi que você já é membro WeDrop. Vou te direcionar para o suporte exclusivo de alunos: https://wa.me/..."
                />
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={form.handoffOnMatch}
                    onCheckedChange={v => setForm({ ...form, handoffOnMatch: v })}
                  />
                  Marcar como handoff humano
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={form.notifyOwnerOnMatch}
                    onCheckedChange={v => setForm({ ...form, notifyOwnerOnMatch: v })}
                  />
                  Notificar o dono
                </label>
              </div>
            </>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={
                !form.slug || !form.label || !form.description || create.isPending
              }
              onClick={() =>
                create.mutate({
                  agentId,
                  slug: form.slug,
                  label: form.label,
                  description: form.description,
                  isBlocking: form.isBlocking,
                  replyWhenBlocked: form.replyWhenBlocked || null,
                  handoffOnMatch: form.handoffOnMatch,
                  notifyOwnerOnMatch: form.notifyOwnerOnMatch,
                  badgeColor: "amber",
                  isActive: true,
                })
              }
            >
              Salvar regra
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {(rules ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhuma regra cadastrada ainda. Clique em “Nova regra” para começar.
          </p>
        )}
        {(rules ?? []).map(r => (
          <div
            key={r.id}
            className="rounded-xl border border-border/60 bg-background/40 p-3 flex items-start gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{r.label}</span>
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                  {r.slug}
                </span>
                {r.isBlocking ? (
                  <span className="text-[11px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">
                    <Lock className="h-3 w-3" /> bloqueante
                  </span>
                ) : (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300">
                    informativa
                  </span>
                )}
                {r.notifyOwnerOnMatch && (
                  <span className="text-[11px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                    <Bell className="h-3 w-3" /> notifica dono
                  </span>
                )}
                {!r.isActive && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    desativada
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {r.description}
              </p>
              {r.isBlocking && r.replyWhenBlocked && (
                <p className="text-xs mt-1 italic text-foreground/80 line-clamp-2">
                  “{r.replyWhenBlocked}”
                </p>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  update.mutate({
                    id: r.id,
                    agentId,
                    patch: { isActive: !r.isActive },
                  })
                }
              >
                {r.isActive ? "Desativar" : "Ativar"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => remove.mutate({ id: r.id, agentId })}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RestrictedTermsSection({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const { data: terms } = trpc.restrictedTerms.list.useQuery({ agentId });
  const add = trpc.restrictedTerms.add.useMutation({
    onSuccess: () => {
      utils.restrictedTerms.list.invalidate({ agentId });
      setNew("");
      toast.success("Termo adicionado");
    },
  });
  const remove = trpc.restrictedTerms.remove.useMutation({
    onSuccess: () => utils.restrictedTerms.list.invalidate({ agentId }),
  });
  const [novoTermo, setNew] = useState("");
  const [action, setAction] = useState<"block" | "rewrite">("block");

  return (
    <div className="elevated-card rounded-2xl p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-destructive/15 grid place-items-center text-destructive shrink-0">
          <ShieldOff className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <Label className="text-sm">Termos proibidos</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            O agente é verificado a cada resposta. Se um termo desta lista for
            usado, a IA é instruída a regerar. Em último caso, o termo é
            substituído por travessão.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(terms ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum termo cadastrado.</p>
        )}
        {(terms ?? []).map(t => (
          <span
            key={t.id}
            className={
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs border " +
              (t.action === "block"
                ? "bg-destructive/10 text-destructive border-destructive/30"
                : "bg-amber-500/10 text-amber-300 border-amber-500/30")
            }
          >
            {t.term}
            <span className="opacity-60 text-[10px] uppercase">{t.action}</span>
            <button
              type="button"
              className="opacity-70 hover:opacity-100"
              onClick={() => remove.mutate({ id: t.id, agentId })}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={novoTermo}
          onChange={e => setNew(e.target.value)}
          placeholder="Ex.: garantido, melhor do mercado"
          className="flex-1"
        />
        <Select value={action} onValueChange={v => setAction(v as any)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="block">Bloquear (regerar)</SelectItem>
            <SelectItem value="rewrite">Reescrever</SelectItem>
          </SelectContent>
        </Select>
        <Button
          onClick={() => {
            if (!novoTermo.trim()) return;
            add.mutate({ agentId, term: novoTermo.trim(), action });
          }}
          disabled={add.isPending || !novoTermo.trim()}
        >
          <Plus className="h-4 w-4 mr-1.5" /> Adicionar
        </Button>
      </div>
    </div>
  );
}

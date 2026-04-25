import AppLayout from "@/components/AppLayout";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAgent } from "@/contexts/AgentContext";
import { trpc } from "@/lib/trpc";
import { Plus, Sparkles, Trash2, Edit3, CheckCircle2, PauseCircle, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function AgentsPage() {
  const utils = trpc.useUtils();
  const { data: agents } = trpc.agents.list.useQuery();
  const { data: models } = trpc.catalog.llmModels.useQuery();
  const { setSelectedAgentId } = useAgent();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const create = trpc.agents.create.useMutation({
    onSuccess: async (id: any) => {
      await utils.agents.list.invalidate();
      if (typeof id === "number") setSelectedAgentId(id);
      toast.success("Agente criado");
      setOpen(false);
    },
  });
  const update = trpc.agents.update.useMutation({
    onSuccess: async () => {
      await utils.agents.list.invalidate();
      toast.success("Agente atualizado");
      setEditing(null);
      setOpen(false);
    },
  });
  const del = trpc.agents.delete.useMutation({
    onSuccess: async () => {
      await utils.agents.list.invalidate();
      toast.success("Agente removido");
    },
  });

  const [form, setForm] = useState({
    name: "",
    description: "",
    persona: "",
    defaultLlmModel: "gpt-4.1",
    status: "draft" as "draft" | "active" | "paused",
    language: "pt-BR",
  });

  function openCreate() {
    setEditing(null);
    setForm({
      name: "",
      description: "",
      persona: "",
      defaultLlmModel: "gpt-4.1",
      status: "draft",
      language: "pt-BR",
    });
    setOpen(true);
  }
  function openEdit(a: any) {
    setEditing(a);
    setForm({
      name: a.name,
      description: a.description ?? "",
      persona: a.persona ?? "",
      defaultLlmModel: a.defaultLlmModel,
      status: a.status,
      language: a.language,
    });
    setOpen(true);
  }
  function submit() {
    if (!form.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (editing) {
      update.mutate({ id: editing.id, patch: form });
    } else {
      create.mutate(form);
    }
  }

  return (
    <AppLayout>
      <div className="container py-10">
        <PageHeader
          eyebrow="Workspace"
          title="Agentes"
          description="Cada agente é uma instância independente com seu próprio cérebro, base de conhecimento, mídias, follow-ups e número de WhatsApp."
          actions={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1.5" />
              Novo agente
            </Button>
          }
        />

        {!agents || agents.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-5 w-5" />}
            title="Crie seu primeiro agente"
            description="Comece configurando o cérebro, etapas e número de WhatsApp."
            action={<Button onClick={openCreate}>Criar agente</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {agents.map(a => (
              <div key={a.id} className="elevated-card rounded-2xl p-6 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium text-lg leading-tight">{a.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {a.language} · {a.defaultLlmModel}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
                {a.description && (
                  <p className="text-sm text-muted-foreground line-clamp-3">{a.description}</p>
                )}
                <div className="flex items-center gap-2 pt-2 mt-auto">
                  <Button size="sm" variant="secondary" onClick={() => setSelectedAgentId(a.id)}>
                    Selecionar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(a)}>
                    <Edit3 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => {
                      if (confirm(`Excluir o agente "${a.name}"? Conversas e leads são preservados.`))
                        del.mutate({ id: a.id });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar agente" : "Novo agente"}</DialogTitle>
              <DialogDescription>
                Defina identidade base. O cérebro detalhado é configurado depois.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome do agente</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex.: Vendedor Premium"
                />
              </div>
              <div>
                <Label>Descrição interna</Label>
                <Input
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Para que serve este agente"
                />
              </div>
              <div>
                <Label>Persona resumida</Label>
                <Textarea
                  rows={3}
                  value={form.persona}
                  onChange={e => setForm({ ...form, persona: e.target.value })}
                  placeholder='Ex.: "Sou Marina, consultora de vendas. Tom acolhedor e direto."'
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Modelo padrão</Label>
                  <Select
                    value={form.defaultLlmModel}
                    onValueChange={v => setForm({ ...form, defaultLlmModel: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(models ?? []).map(m => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label} <span className="text-muted-foreground">· {m.provider}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v: any) => setForm({ ...form, status: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Rascunho</SelectItem>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="paused">Pausado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Idioma</Label>
                <Select
                  value={form.language}
                  onValueChange={v => setForm({ ...form, language: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                    <SelectItem value="en-US">English (US)</SelectItem>
                    <SelectItem value="es-ES">Español</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={submit} disabled={create.isPending || update.isPending}>
                {editing ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "active")
    return (
      <Badge className="bg-primary/15 text-primary border-primary/20">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Ativo
      </Badge>
    );
  if (status === "paused")
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <PauseCircle className="h-3 w-3 mr-1" />
        Pausado
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-muted-foreground">
      <FileText className="h-3 w-3 mr-1" />
      Rascunho
    </Badge>
  );
}

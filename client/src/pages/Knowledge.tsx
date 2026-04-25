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
import { trpc } from "@/lib/trpc";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function KnowledgePage() {
  return (
    <AppLayout>
      <AgentRequired>{agentId => <KbEditor agentId={agentId} />}</AgentRequired>
    </AppLayout>
  );
}

function KbEditor({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const { data: items } = trpc.knowledge.list.useQuery({ agentId });
  const create = trpc.knowledge.create.useMutation({
    onSuccess: () => {
      utils.knowledge.list.invalidate({ agentId });
      setOpen(false);
      toast.success("Item adicionado");
    },
  });
  const update = trpc.knowledge.update.useMutation({
    onSuccess: () => {
      utils.knowledge.list.invalidate({ agentId });
      setOpen(false);
      toast.success("Item atualizado");
    },
  });
  const del = trpc.knowledge.delete.useMutation({
    onSuccess: () => utils.knowledge.list.invalidate({ agentId }),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ title: "", content: "", tags: "" });

  function openCreate() {
    setEditing(null);
    setForm({ title: "", content: "", tags: "" });
    setOpen(true);
  }
  function openEdit(it: any) {
    setEditing(it);
    setForm({ title: it.title, content: it.content, tags: it.tags ?? "" });
    setOpen(true);
  }
  function submit() {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error("Título e conteúdo são obrigatórios");
      return;
    }
    if (editing) update.mutate({ id: editing.id, patch: form });
    else create.mutate({ agentId, ...form });
  }

  return (
    <div className="container py-10 max-w-4xl">
      <PageHeader
        eyebrow="Configuração"
        title="Base de conhecimento"
        description="Quando o lead pergunta algo, o agente busca aqui antes de responder. Cadastre FAQs, dados, política, valores."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Novo item
          </Button>
        }
      />
      {!items || items.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-5 w-5" />}
          title="Sua base está vazia"
          description="Adicione perguntas frequentes e informações que o agente pode usar para responder com precisão."
          action={<Button onClick={openCreate}>Adicionar item</Button>}
        />
      ) : (
        <div className="space-y-3">
          {items.map(it => (
            <div key={it.id} className="elevated-card rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium">{it.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1.5 whitespace-pre-wrap line-clamp-4">
                    {it.content}
                  </p>
                  {it.tags && (
                    <p className="text-xs text-muted-foreground mt-2">
                      <span className="font-medium">tags:</span> {it.tags}
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => openEdit(it)}>
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => del.mutate({ id: it.id })}
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
            <DialogTitle>{editing ? "Editar item" : "Novo item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título</Label>
              <Input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="Ex.: Política de cancelamento"
              />
            </div>
            <div>
              <Label>Conteúdo</Label>
              <Textarea
                rows={10}
                value={form.content}
                onChange={e => setForm({ ...form, content: e.target.value })}
                placeholder="Conteúdo detalhado que o agente pode usar..."
                className="font-mono text-sm"
              />
            </div>
            <div>
              <Label>Tags (separadas por vírgula)</Label>
              <Input
                value={form.tags}
                onChange={e => setForm({ ...form, tags: e.target.value })}
                placeholder="Ex.: cancelamento, reembolso, política"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

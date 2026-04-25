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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function TemplatesPage() {
  return (
    <AppLayout>
      <AgentRequired>{agentId => <Inner agentId={agentId} />}</AgentRequired>
    </AppLayout>
  );
}

function Inner({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const { data: items } = trpc.whatsapp.listTemplates.useQuery({ agentId });
  const create = trpc.whatsapp.createTemplate.useMutation({
    onSuccess: () => {
      utils.whatsapp.listTemplates.invalidate({ agentId });
      setOpen(false);
      toast.success("Template registrado");
    },
  });
  const del = trpc.whatsapp.deleteTemplate.useMutation({
    onSuccess: () => utils.whatsapp.listTemplates.invalidate({ agentId }),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    languageCode: string;
    category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
    bodyText: string;
    variables: string;
    status: "approved" | "pending" | "rejected";
  }>({
    name: "",
    languageCode: "pt_BR",
    category: "UTILITY",
    bodyText: "",
    variables: "",
    status: "approved",
  });

  function submit() {
    if (!form.name.trim() || !form.bodyText.trim()) {
      toast.error("Nome e corpo são obrigatórios");
      return;
    }
    create.mutate({
      agentId,
      name: form.name,
      languageCode: form.languageCode,
      category: form.category,
      bodyText: form.bodyText,
      status: form.status,
      variables: form.variables
        .split(",")
        .map(v => v.trim())
        .filter(Boolean),
    });
  }

  return (
    <div className="container py-10 max-w-4xl">
      <PageHeader
        eyebrow="WhatsApp"
        title="Templates aprovados (HSM)"
        description="Para enviar mensagens fora da janela de 24h é obrigatório usar templates aprovados pela Meta. Cadastre aqui o espelho dos templates que existem na sua WABA."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Novo template
          </Button>
        }
      />

      {!items || items.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="h-5 w-5" />}
          title="Nenhum template cadastrado"
          description="Eles serão usados pelo motor de follow-up quando a janela de 24h estiver fechada."
          action={<Button onClick={() => setOpen(true)}>Adicionar template</Button>}
        />
      ) : (
        <div className="space-y-3">
          {items.map(t => (
            <div key={t.id} className="elevated-card rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium">{t.name}</h3>
                    <Badge variant="outline" className="text-xs">{t.category}</Badge>
                    <Badge variant="outline" className="text-xs">{t.languageCode}</Badge>
                    <StatusPill status={t.status} />
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-2">
                    {t.bodyText}
                  </p>
                  {Array.isArray(t.variables) && (t.variables as any).length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="font-medium">variáveis:</span>{" "}
                      {(t.variables as any).join(", ")}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={() => del.mutate({ id: t.id })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo template</DialogTitle>
            <DialogDescription>
              O nome e o corpo precisam ser idênticos ao template aprovado na Meta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome (exato)</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="ex.: followup_24h"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Idioma</Label>
                <Input
                  value={form.languageCode}
                  onChange={e => setForm({ ...form, languageCode: e.target.value })}
                  placeholder="pt_BR"
                />
              </div>
              <div>
                <Label>Categoria</Label>
                <Select
                  value={form.category}
                  onValueChange={(v: any) => setForm({ ...form, category: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MARKETING">MARKETING</SelectItem>
                    <SelectItem value="UTILITY">UTILITY</SelectItem>
                    <SelectItem value="AUTHENTICATION">AUTHENTICATION</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Corpo do template</Label>
              <Textarea
                rows={4}
                value={form.bodyText}
                onChange={e => setForm({ ...form, bodyText: e.target.value })}
                placeholder="Olá {{1}}, ainda posso te ajudar com..."
                className="font-mono text-sm"
              />
            </div>
            <div>
              <Label>Variáveis (separadas por vírgula, na ordem)</Label>
              <Input
                value={form.variables}
                onChange={e => setForm({ ...form, variables: e.target.value })}
                placeholder="nome_lead, produto"
              />
            </div>
            <div>
              <Label>Status atual na Meta</Label>
              <Select
                value={form.status}
                onValueChange={(v: any) => setForm({ ...form, status: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Aprovado</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="rejected">Rejeitado</SelectItem>
                </SelectContent>
              </Select>
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

function StatusPill({ status }: { status: string }) {
  if (status === "approved")
    return <Badge className="bg-primary/15 text-primary border-primary/20">aprovado</Badge>;
  if (status === "pending") return <Badge variant="outline">pendente</Badge>;
  return <Badge variant="destructive">rejeitado</Badge>;
}

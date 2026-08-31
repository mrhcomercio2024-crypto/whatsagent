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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Image as ImageIcon, Plus, Trash2, Video, FileText, Music, Zap } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

export default function MediaPage() {
  return (
    <AppLayout>
      <AgentRequired>{agentId => <MediaInner agentId={agentId} />}</AgentRequired>
    </AppLayout>
  );
}

function MediaInner({ agentId }: { agentId: number }) {
  return (
    <div className="container py-10 max-w-5xl">
      <PageHeader
        eyebrow="Configuração"
        title="Mídias e gatilhos"
        description="Hospede imagens e vídeos da sua oferta. Defina quando o agente deve enviá-los: por palavra-chave do lead, por etapa do script, ou deixe a IA decidir."
      />
      <Tabs defaultValue="library">
        <TabsList className="mb-6">
          <TabsTrigger value="library">Biblioteca</TabsTrigger>
          <TabsTrigger value="triggers">Gatilhos</TabsTrigger>
        </TabsList>
        <TabsContent value="library">
          <Library agentId={agentId} />
        </TabsContent>
        <TabsContent value="triggers">
          <Triggers agentId={agentId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function Library({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const { data: media } = trpc.media.list.useQuery({ agentId });
  const upload = trpc.media.upload.useMutation({
    onSuccess: () => {
      utils.media.list.invalidate({ agentId });
      setOpen(false);
      toast.success("Mídia enviada");
    },
    onError: e => toast.error(e.message),
  });
  const del = trpc.media.delete.useMutation({
    onSuccess: () => utils.media.list.invalidate({ agentId }),
  });

  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<{
    name: string;
    description: string;
    caption: string;
    purpose: string;
    mediaType: "image" | "video" | "document" | "audio";
    base64: string;
    mimeType: string;
  }>({
    name: "",
    description: "",
    caption: "",
    purpose: "outro",
    mediaType: "image",
    base64: "",
    mimeType: "",
  });

  function reset() {
    setForm({ name: "", description: "", caption: "", purpose: "outro", mediaType: "image", base64: "", mimeType: "" });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      let mediaType: typeof form.mediaType = "image";
      if (file.type.startsWith("video/")) mediaType = "video";
      else if (file.type.startsWith("audio/")) mediaType = "audio";
      else if (!file.type.startsWith("image/")) mediaType = "document";
      setForm(prev => ({
        ...prev,
        name: prev.name || file.name,
        mediaType,
        base64,
        mimeType: file.type,
      }));
    };
    reader.readAsDataURL(file);
  }

  function submit() {
    if (!form.base64 || !form.mimeType || !form.name) {
      toast.error("Selecione um arquivo e dê um nome");
      return;
    }
    upload.mutate({
      agentId,
      name: form.name,
      description: form.description || null,
      caption: form.caption || null,
      purpose: form.purpose || "outro",
      mediaType: form.mediaType,
      base64: form.base64,
      mimeType: form.mimeType,
    });
  }

  const PURPOSE_LABEL: Record<string, string> = {
    prova_social: "Provas sociais",
    explicacao_produto: "Explicação do produto",
    combate_objecao: "Combate a objeções",
    bonus: "Bônus",
    garantia: "Garantia",
    apresentacao: "Apresentação",
    outro: "Outro",
  };

  const grouped: Record<string, typeof media extends infer T | undefined ? Exclude<T, undefined> : never> =
    {} as any;
  if (media) {
    for (const m of media) {
      const key = (m as any).purpose || "outro";
      (grouped as any)[key] = (grouped as any)[key] || [];
      (grouped as any)[key].push(m);
    }
  }
  const groupKeys = Object.keys(grouped).sort((a, b) => {
    const order = ["prova_social", "explicacao_produto", "combate_objecao", "bonus", "garantia", "apresentacao", "outro"];
    return order.indexOf(a) - order.indexOf(b);
  });

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button
          onClick={() => {
            reset();
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Nova mídia
        </Button>
      </div>
      {!media || media.length === 0 ? (
        <EmptyState
          icon={<ImageIcon className="h-5 w-5" />}
          title="Sem mídias cadastradas"
          description="Carregue imagens, vídeos ou documentos. Depois associe a gatilhos."
        />
      ) : (
        <div className="space-y-8">
          {groupKeys.map(group => (
            <div key={group}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                {PURPOSE_LABEL[group] || group}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {(grouped as any)[group].map((m: any) => (
            <div key={m.id} className="elevated-card rounded-2xl overflow-hidden">
              <div className="aspect-video bg-muted/30 grid place-items-center overflow-hidden">
                {m.mediaType === "image" ? (
                  <img src={m.storageUrl} alt={m.name} className="w-full h-full object-cover" />
                ) : m.mediaType === "video" ? (
                  <video src={m.storageUrl} className="w-full h-full object-cover" muted />
                ) : m.mediaType === "audio" ? (
                  <Music className="h-8 w-8 text-muted-foreground" />
                ) : (
                  <FileText className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-sm truncate">{m.name}</p>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {m.mediaType}
                  </span>
                </div>
                {m.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{m.description}</p>
                )}
                <div className="flex gap-1 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive flex-1"
                    onClick={() => {
                      if (confirm(`Excluir "${m.name}"?`)) del.mutate({ id: m.id });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Remover
                  </Button>
                </div>
              </div>
            </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova mídia</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Arquivo</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*,audio/*,application/pdf"
                onChange={onFile}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:px-3 file:py-2 file:font-medium hover:file:bg-primary/90"
              />
              {form.mimeType && (
                <p className="text-xs text-muted-foreground mt-1">
                  {form.mimeType} · {form.mediaType}
                </p>
              )}
            </div>
            <div>
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Ex.: Demo do produto"
              />
            </div>
            <div>
              <Label>Descrição (vista pelo agente)</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Vídeo de 30s mostrando os 3 principais benefícios."
              />
            </div>
            <div>
              <Label>Legenda enviada com a mídia (opcional)</Label>
              <Input
                value={form.caption}
                onChange={e => setForm({ ...form, caption: e.target.value })}
                placeholder="Veja em 30s o que faz a diferença ;)"
              />
            </div>
            <div>
              <Label>Propósito (agrupamento e uso pela IA)</Label>
              <Select value={form.purpose} onValueChange={v => setForm({ ...form, purpose: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="prova_social">Prova social</SelectItem>
                  <SelectItem value="explicacao_produto">Explicação do produto</SelectItem>
                  <SelectItem value="combate_objecao">Combate a objeção</SelectItem>
                  <SelectItem value="bonus">Bônus</SelectItem>
                  <SelectItem value="garantia">Garantia</SelectItem>
                  <SelectItem value="apresentacao">Apresentação</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                A IA agrupa as mídias por propósito no prompt, o que a ajuda a escolher a certa na hora certa.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={upload.isPending}>
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function Triggers({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const { data: triggers } = trpc.media.listTriggers.useQuery({ agentId });
  const { data: media } = trpc.media.list.useQuery({ agentId });
  const { data: steps } = trpc.steps.list.useQuery({ agentId });
  const create = trpc.media.createTrigger.useMutation({
    onSuccess: () => {
      utils.media.listTriggers.invalidate({ agentId });
      setOpen(false);
      toast.success("Gatilho criado");
    },
  });
  const update = trpc.media.updateTrigger.useMutation({
    onSuccess: () => utils.media.listTriggers.invalidate({ agentId }),
  });
  const del = trpc.media.deleteTrigger.useMutation({
    onSuccess: () => utils.media.listTriggers.invalidate({ agentId }),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{
    mediaId: number | null;
    triggerType: "keyword" | "step" | "ai_decision" | "intent";
    keywords: string;
    stepId: number | null;
    intentLabel: string;
    intentDescription: string;
    sendOncePerConversation: boolean;
    isActive: boolean;
  }>({
    mediaId: null,
    triggerType: "keyword",
    keywords: "",
    stepId: null,
    intentLabel: "",
    intentDescription: "",
    sendOncePerConversation: true,
    isActive: true,
  });

  function submit() {
    if (!form.mediaId) return toast.error("Escolha uma mídia");
    if (form.triggerType === "keyword" && !form.keywords.trim())
      return toast.error("Informe palavras-chave");
    if (form.triggerType === "step" && !form.stepId) return toast.error("Selecione uma etapa");
    if (form.triggerType === "intent") {
      if (!form.intentLabel.trim()) return toast.error("Informe um rótulo para a intenção");
      if (!form.intentDescription.trim())
        return toast.error("Descreva em linguagem natural o que essa intenção captura");
    }
    create.mutate({
      agentId,
      mediaId: form.mediaId,
      triggerType: form.triggerType,
      keywords: form.triggerType === "keyword" ? form.keywords : null,
      stepId: form.triggerType === "step" ? form.stepId : null,
      intentLabel: form.triggerType === "intent" ? form.intentLabel.trim() : null,
      intentDescription:
        form.triggerType === "intent" ? form.intentDescription.trim() : null,
      sendOncePerConversation: form.sendOncePerConversation,
      isActive: form.isActive,
    });
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Novo gatilho
        </Button>
      </div>
      {!triggers || triggers.length === 0 ? (
        <EmptyState
          icon={<Zap className="h-5 w-5" />}
          title="Nenhum gatilho configurado"
          description="Conecte mídias a palavras-chave (ex.: 'preço', 'demonstração') ou a etapas do script."
        />
      ) : (
        <div className="space-y-2">
          {triggers.map(t => {
            const m = media?.find(x => x.id === t.mediaId);
            const s = steps?.find(x => x.id === t.stepId);
            return (
              <div
                key={t.id}
                className="elevated-card rounded-xl p-4 flex items-center gap-4 flex-wrap"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/15 grid place-items-center text-primary">
                  {m?.mediaType === "video" ? (
                    <Video className="h-4 w-4" />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{m?.name ?? "Mídia removida"}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.triggerType === "keyword" && `Palavra-chave: ${t.keywords}`}
                    {t.triggerType === "step" && `Etapa: ${s?.name ?? "?"}`}
                    {t.triggerType === "ai_decision" && "Decisão da IA"}
                    {t.triggerType === "intent" && (
                      <>Intenção: <span className="font-medium">{t.intentLabel}</span></>
                    )}
                    {" · "}enviar {t.sendOncePerConversation ? "1x por conversa" : "sempre que disparar"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={t.isActive}
                    onCheckedChange={v => update.mutate({ id: t.id, patch: { isActive: v } })}
                  />
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
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo gatilho</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Mídia</Label>
              <Select
                value={form.mediaId ? String(form.mediaId) : ""}
                onValueChange={v => setForm({ ...form, mediaId: parseInt(v, 10) })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha uma mídia" />
                </SelectTrigger>
                <SelectContent>
                  {(media ?? []).map(m => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name} ({m.mediaType})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quando disparar</Label>
              <Select
                value={form.triggerType}
                onValueChange={(v: any) => setForm({ ...form, triggerType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keyword">Palavra-chave do lead</SelectItem>
                  <SelectItem value="step">Etapa específica do script</SelectItem>
                  <SelectItem value="ai_decision">Deixar IA decidir</SelectItem>
                  <SelectItem value="intent">Intenção do lead (classificador IA)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.triggerType === "keyword" && (
              <div>
                <Label>Palavras-chave (separadas por vírgula)</Label>
                <Input
                  value={form.keywords}
                  onChange={e => setForm({ ...form, keywords: e.target.value })}
                  placeholder="preço, valor, quanto custa"
                />
              </div>
            )}
            {form.triggerType === "step" && (
              <div>
                <Label>Etapa do script</Label>
                <Select
                  value={form.stepId ? String(form.stepId) : ""}
                  onValueChange={v => setForm({ ...form, stepId: parseInt(v, 10) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {(steps ?? []).map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.triggerType === "intent" && (
              <div className="space-y-3">
                <div>
                  <Label>Rótulo da intenção (slug curto, sem espaços)</Label>
                  <Input
                    value={form.intentLabel}
                    onChange={e =>
                      setForm({
                        ...form,
                        intentLabel: e.target.value.toLowerCase().replace(/\s+/g, "_"),
                      })
                    }
                    placeholder="duvida_preco"
                  />
                </div>
                <div>
                  <Label>Descrição em linguagem natural (o classificador IA lê isso)</Label>
                  <Textarea
                    rows={3}
                    value={form.intentDescription}
                    onChange={e => setForm({ ...form, intentDescription: e.target.value })}
                    placeholder="Lead pergunta ou demonstra dúvida sobre quanto custa, menciona orçamento, valor, preço, caro, barato."
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Seja específico sobre o que caracteriza a intenção. A IA usa essa descrição pra
                    reconhecer a fala do lead mesmo quando ele não usa exatamente a palavra-chave.
                  </p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Switch
                checked={form.sendOncePerConversation}
                onCheckedChange={v => setForm({ ...form, sendOncePerConversation: v })}
              />
              <Label>Enviar no máximo 1x por conversa</Label>
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

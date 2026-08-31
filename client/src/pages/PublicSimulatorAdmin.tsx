import { AgentRequired } from "@/components/AgentRequired";
import AppLayout from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  ExternalLink,
  FileAudio,
  ImageIcon,
  Link2,
  Loader2,
  MessageCircleMore,
  MousePointerClick,
  RefreshCw,
  Save,
  Settings2,
  Smartphone,
  Upload,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { StepsEditor } from "./Steps";
import { Library, Triggers } from "./Media";

type ConfigForm = {
  slug: string;
  enabled: boolean;
  displayName: string;
  statusText: string;
  avatarUrl: string | null;
  accentColor: string;
  welcomeMessage: string;
  startButtonText: string;
  startLeadMessage: string;
  inputPlaceholder: string;
  checkoutUrl: string;
  checkoutButtonText: string;
  purchaseEventNamesText: string;
  checkoutRequestPatternsText: string;
};

const EMPTY_FORM: ConfigForm = {
  slug: "ravi",
  enabled: true,
  displayName: "RAVI",
  statusText: "online",
  avatarUrl: null,
  accentColor: "#00a884",
  welcomeMessage: "",
  startButtonText: "SIM, QUERO SABER",
  startLeadMessage: "Sim, quero saber como funciona.",
  inputPlaceholder: "Digite uma mensagem",
  checkoutUrl: "",
  checkoutButtonText: "ABRIR CHECKOUT",
  purchaseEventNamesText: "order.paid\ninvoice.paid\ncharge.paid",
  checkoutRequestPatternsText: "quero o link\nmanda o link\nme passa o link\nquero comprar\ncheckout",
};

export default function PublicSimulatorAdmin() {
  return (
    <AppLayout>
      <AgentRequired>{agentId => <AdminInner agentId={agentId} />}</AgentRequired>
    </AppLayout>
  );
}

function AdminInner({ agentId }: { agentId: number }) {
  const [tab, setTab] = useState("config");
  return (
    <div className="container max-w-7xl py-8">
      <PageHeader
        eyebrow="Aquisição pública"
        title="SIMULADOR WHATSAPP"
        description="Publique uma conversa real com o seu agente, edite todo o roteiro e acompanhe do anúncio até a compra confirmada."
      />
      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-muted/40 p-1 md:grid-cols-4">
          <TabsTrigger value="config" className="gap-2 py-2.5">
            <Settings2 className="size-4" /> Configuração
          </TabsTrigger>
          <TabsTrigger value="steps" className="gap-2 py-2.5">
            <MessageCircleMore className="size-4" /> Etapas
          </TabsTrigger>
          <TabsTrigger value="media" className="gap-2 py-2.5">
            <ImageIcon className="size-4" /> Mídias
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2 py-2.5">
            <UserRound className="size-4" /> Conversas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-6">
          <ConfigPanel agentId={agentId} />
        </TabsContent>
        <TabsContent value="steps" className="mt-2">
          <StepsEditor agentId={agentId} />
        </TabsContent>
        <TabsContent value="media" className="mt-6 space-y-10">
          <section>
            <div className="mb-4">
              <h2 className="text-xl font-semibold">Biblioteca do agente</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Envie imagens, vídeos, áudios e PDFs usados durante a conversa pública.
              </p>
            </div>
            <Library agentId={agentId} />
          </section>
          <section className="border-t border-border/60 pt-8">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">Gatilhos e etapa de envio</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Vincule cada mídia a uma etapa, palavra-chave, intenção ou decisão do agente.
              </p>
            </div>
            <Triggers agentId={agentId} />
          </section>
        </TabsContent>
        <TabsContent value="history" className="mt-6">
          <HistoryPanel agentId={agentId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ConfigPanel({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const { data: config, isLoading } = trpc.publicSimulatorAdmin.getConfig.useQuery({ agentId });
  const [form, setForm] = useState<ConfigForm>(EMPTY_FORM);
  const avatarInput = useRef<HTMLInputElement>(null);
  const update = trpc.publicSimulatorAdmin.updateConfig.useMutation({
    onSuccess: data => {
      utils.publicSimulatorAdmin.getConfig.setData({ agentId }, data);
      toast.success("Simulador atualizado");
    },
    onError: error => toast.error(error.message),
  });
  const uploadAvatar = trpc.publicSimulatorAdmin.uploadAvatar.useMutation({
    onSuccess: result => {
      setForm(previous => ({ ...previous, avatarUrl: result.url }));
      utils.publicSimulatorAdmin.getConfig.invalidate({ agentId });
      toast.success("Avatar atualizado");
    },
    onError: error => toast.error(error.message),
  });
  const regenerate = trpc.publicSimulatorAdmin.regenerateWebhookSecret.useMutation({
    onSuccess: data => {
      utils.publicSimulatorAdmin.getConfig.setData({ agentId }, data);
      toast.success("Segredo do webhook renovado");
    },
  });

  useEffect(() => {
    if (!config) return;
    setForm({
      slug: config.slug,
      enabled: config.enabled,
      displayName: config.displayName,
      statusText: config.statusText,
      avatarUrl: config.avatarUrl,
      accentColor: config.accentColor,
      welcomeMessage: config.welcomeMessage,
      startButtonText: config.startButtonText,
      startLeadMessage: config.startLeadMessage,
      inputPlaceholder: config.inputPlaceholder,
      checkoutUrl: config.checkoutUrl || "",
      checkoutButtonText: config.checkoutButtonText,
      purchaseEventNamesText: parseList(config.purchaseEventNames).join("\n"),
      checkoutRequestPatternsText: parseList(config.checkoutRequestPatterns).join("\n"),
    });
  }, [config]);

  const publicUrl = `${window.location.origin}/simulador/${form.slug || "ravi"}`;
  const webhookUrl = config
    ? `${window.location.origin}/api/public-simulator/${config.slug}/checkout/${config.webhookSecret}`
    : "";

  const save = () => {
    update.mutate({
      agentId,
      slug: form.slug.trim().toLowerCase(),
      enabled: form.enabled,
      displayName: form.displayName.trim(),
      statusText: form.statusText.trim(),
      avatarUrl: form.avatarUrl,
      accentColor: form.accentColor,
      welcomeMessage: form.welcomeMessage.trim(),
      startButtonText: form.startButtonText.trim(),
      startLeadMessage: form.startLeadMessage.trim(),
      inputPlaceholder: form.inputPlaceholder.trim(),
      checkoutUrl: form.checkoutUrl.trim() || null,
      checkoutButtonText: form.checkoutButtonText.trim(),
      purchaseEventNames: splitLines(form.purchaseEventNamesText),
      checkoutRequestPatterns: splitLines(form.checkoutRequestPatternsText),
    });
  };

  const onAvatar = async (file?: File) => {
    if (!file) return;
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      toast.error("Use JPG, PNG ou WEBP");
      return;
    }
    const base64 = await fileToDataUrl(file);
    uploadAvatar.mutate({ agentId, base64, mimeType: file.type as any });
  };

  if (isLoading) {
    return <div className="grid min-h-60 place-items-center"><Loader2 className="size-6 animate-spin" /></div>;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Publicação e identidade</CardTitle>
              <CardDescription>Esta página é pública; somente este editor exige login.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="sim-enabled" className="text-xs text-muted-foreground">
                {form.enabled ? "Publicado" : "Pausado"}
              </Label>
              <Switch
                id="sim-enabled"
                checked={form.enabled}
                onCheckedChange={enabled => setForm(previous => ({ ...previous, enabled }))}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
              <Label className="text-xs">Link público para anúncios e testes</Label>
              <div className="mt-2 flex gap-2">
                <Input readOnly value={publicUrl} className="font-mono text-xs" />
                <CopyButton value={publicUrl} />
                <Button variant="outline" size="icon" onClick={() => window.open(publicUrl, "_blank")}>
                  <ExternalLink className="size-4" />
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Endereço público">
                <div className="flex items-center rounded-md border border-input bg-background">
                  <span className="pl-3 text-sm text-muted-foreground">/simulador/</span>
                  <Input
                    value={form.slug}
                    onChange={event => setForm(previous => ({
                      ...previous,
                      slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                    }))}
                    className="border-0 pl-0 shadow-none focus-visible:ring-0"
                  />
                </div>
              </Field>
              <Field label="Cor principal">
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={form.accentColor}
                    onChange={event => setForm(previous => ({ ...previous, accentColor: event.target.value }))}
                    className="h-10 w-14 rounded-md border bg-background p-1"
                  />
                  <Input
                    value={form.accentColor}
                    onChange={event => setForm(previous => ({ ...previous, accentColor: event.target.value }))}
                  />
                </div>
              </Field>
              <Field label="Nome exibido">
                <Input value={form.displayName} onChange={event => setForm(previous => ({ ...previous, displayName: event.target.value }))} />
              </Field>
              <Field label="Status do cabeçalho">
                <Input value={form.statusText} onChange={event => setForm(previous => ({ ...previous, statusText: event.target.value }))} />
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-4 rounded-xl border p-4">
              {form.avatarUrl ? (
                <img src={form.avatarUrl} alt="Avatar" className="size-16 rounded-full object-cover" />
              ) : (
                <div className="grid size-16 place-items-center rounded-full text-xl font-bold text-black" style={{ backgroundColor: form.accentColor }}>
                  {form.displayName.slice(0, 1).toUpperCase() || "R"}
                </div>
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">Avatar público</p>
                <p className="mt-1 text-xs text-muted-foreground">JPG, PNG ou WEBP, até 5 MB.</p>
              </div>
              <input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={event => void onAvatar(event.target.files?.[0])} />
              <Button variant="outline" onClick={() => avatarInput.current?.click()} disabled={uploadAvatar.isPending}>
                {uploadAvatar.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
                Enviar avatar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Abertura da conversa</CardTitle>
            <CardDescription>Somente esta primeira mensagem exibe um botão. Depois, o visitante conversa livremente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Primeira mensagem do RAVI">
              <Textarea rows={5} value={form.welcomeMessage} onChange={event => setForm(previous => ({ ...previous, welcomeMessage: event.target.value }))} />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Texto do botão inicial">
                <Input value={form.startButtonText} onChange={event => setForm(previous => ({ ...previous, startButtonText: event.target.value }))} />
              </Field>
              <Field label="Mensagem registrada ao clicar">
                <Input value={form.startLeadMessage} onChange={event => setForm(previous => ({ ...previous, startLeadMessage: event.target.value }))} />
              </Field>
            </div>
            <Field label="Placeholder do campo de mensagem">
              <Input value={form.inputPlaceholder} onChange={event => setForm(previous => ({ ...previous, inputPlaceholder: event.target.value }))} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Checkout Looma / Pagar.me</CardTitle>
            <CardDescription>O link aparece quando o lead pede para comprar; a compra é confirmada pelo webhook.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="URL do checkout Looma">
              <Input
                type="url"
                value={form.checkoutUrl}
                onChange={event => setForm(previous => ({ ...previous, checkoutUrl: event.target.value }))}
                placeholder="https://checkout.looma.com.br/..."
              />
            </Field>
            <Field label="Texto do botão do checkout">
              <Input value={form.checkoutButtonText} onChange={event => setForm(previous => ({ ...previous, checkoutButtonText: event.target.value }))} />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Frases que indicam pedido do link" hint="Uma por linha">
                <Textarea rows={7} value={form.checkoutRequestPatternsText} onChange={event => setForm(previous => ({ ...previous, checkoutRequestPatternsText: event.target.value }))} />
              </Field>
              <Field label="Eventos de compra aprovada" hint="Pagar.me V5, um por linha">
                <Textarea rows={7} className="font-mono text-xs" value={form.purchaseEventNamesText} onChange={event => setForm(previous => ({ ...previous, purchaseEventNamesText: event.target.value }))} />
              </Field>
            </div>
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
              <Label className="text-xs">Webhook para cadastrar na Looma/Pagar.me</Label>
              <div className="mt-2 flex gap-2">
                <Input readOnly value={webhookUrl} className="font-mono text-[11px]" />
                <CopyButton value={webhookUrl} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-4">
                <p className="text-xs text-muted-foreground">Use POST JSON. Eventos recomendados: order.paid, invoice.paid e charge.paid.</p>
                <Button variant="ghost" size="sm" onClick={() => regenerate.mutate({ agentId })} disabled={regenerate.isPending}>
                  <RefreshCw className="mr-2 size-3.5" /> Renovar segredo
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button size="lg" onClick={save} disabled={update.isPending}>
            {update.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
            Salvar simulador
          </Button>
        </div>
      </div>

      <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Smartphone className="size-4" /> Prévia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-[24px] border-[6px] border-slate-950 bg-[#0b141a] shadow-xl">
              <div className="flex items-center gap-2 bg-[#202c33] px-3 py-2.5 text-white">
                {form.avatarUrl ? <img src={form.avatarUrl} className="size-8 rounded-full object-cover" /> : <div className="grid size-8 place-items-center rounded-full text-xs font-bold text-black" style={{ background: form.accentColor }}>{form.displayName.slice(0, 1)}</div>}
                <div><div className="text-xs font-medium">{form.displayName}</div><div className="text-[9px] text-white/50">{form.statusText}</div></div>
              </div>
              <div className="min-h-80 bg-[#0b141a] p-3">
                <div className="max-w-[90%] rounded-lg bg-[#202c33] px-3 py-2 text-[11px] leading-4 text-white shadow">
                  <p>{form.welcomeMessage || "Sua mensagem de abertura aparecerá aqui."}</p>
                  <button className="mt-2 w-full border-t border-white/10 pt-2 text-[9px] font-bold" style={{ color: form.accentColor }}>{form.startButtonText}</button>
                  <div className="mt-1 text-right text-[8px] text-white/40">agora</div>
                </div>
              </div>
              <div className="flex gap-2 bg-[#202c33] p-2"><div className="flex-1 rounded-full bg-[#2a3942] px-3 py-2 text-[9px] text-white/40">{form.inputPlaceholder}</div><div className="grid size-8 place-items-center rounded-full" style={{ background: form.accentColor }}><FileAudio className="size-3.5 text-black" /></div></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function HistoryPanel({ agentId }: { agentId: number }) {
  const { data, isLoading } = trpc.publicSimulatorAdmin.listSessions.useQuery({ agentId, limit: 300 });
  const { data: steps } = trpc.steps.list.useQuery({ agentId });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = data?.find(row => row.session.id === selectedId);
  const stats = useMemo(() => {
    const rows = data || [];
    return {
      total: rows.length,
      active: rows.filter(row => row.session.status === "active").length,
      clicked: rows.filter(row => Boolean(row.session.checkoutClickedAt)).length,
      converted: rows.filter(row => row.session.status === "converted").length,
    };
  }, [data]);

  if (isLoading) return <div className="grid min-h-60 place-items-center"><Loader2 className="size-6 animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Conversas" value={stats.total} icon={MessageCircleMore} />
        <StatCard label="Em andamento" value={stats.active} icon={Clock3} />
        <StatCard label="Cliques no checkout" value={stats.clicked} icon={MousePointerClick} />
        <StatCard label="Compras confirmadas" value={stats.converted} icon={CheckCircle2} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Histórico de visitantes</CardTitle>
          <CardDescription>UTMs, contatos capturados, etapa, checkout e resultado de cada conversa.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!data?.length ? (
            <div className="px-6 py-16 text-center text-sm text-muted-foreground">Nenhuma conversa pública ainda.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="border-y bg-muted/30 text-left text-xs text-muted-foreground">
                  <tr><th className="px-5 py-3">Visitante</th><th className="px-3 py-3">Origem</th><th className="px-3 py-3">Etapa</th><th className="px-3 py-3">Duração</th><th className="px-3 py-3">Checkout</th><th className="px-3 py-3">Resultado</th><th className="px-5 py-3 text-right">Ação</th></tr>
                </thead>
                <tbody className="divide-y">
                  {data.map(row => {
                    const step = steps?.find(item => item.id === row.conversation.currentStepId);
                    return (
                      <tr key={row.session.id} className="hover:bg-muted/20">
                        <td className="px-5 py-4"><div className="font-medium">{row.session.capturedName || `Visitante ${row.session.publicId.slice(0, 6)}`}</div><div className="mt-0.5 text-xs text-muted-foreground">{row.session.capturedPhone || row.session.capturedEmail || "Anônimo"}</div></td>
                        <td className="px-3 py-4"><div>{row.session.utmSource || "Direto"}</div><div className="text-xs text-muted-foreground">{row.session.utmCampaign || "—"}</div></td>
                        <td className="px-3 py-4">{step?.name || "Abertura"}</td>
                        <td className="px-3 py-4">{formatDuration(row.session.startedAt, row.session.updatedAt)}</td>
                        <td className="px-3 py-4">{row.session.checkoutClickedAt ? "Clicou" : row.session.checkoutLinkSentAt ? "Recebeu link" : row.session.checkoutRequestedAt ? "Pediu link" : "—"}</td>
                        <td className="px-3 py-4"><StatusPill status={row.session.status} /></td>
                        <td className="px-5 py-4 text-right"><Button size="sm" variant="outline" onClick={() => setSelectedId(row.session.id)}>Abrir conversa</Button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={Boolean(selectedId)} onOpenChange={open => !open && setSelectedId(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>Conversa pública</DialogTitle></DialogHeader>
          {selected && <SessionDetail agentId={agentId} sessionId={selected.session.id} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SessionDetail({ agentId, sessionId }: { agentId: number; sessionId: number }) {
  const { data, isLoading } = trpc.publicSimulatorAdmin.sessionDetail.useQuery({ agentId, sessionId });
  if (isLoading || !data) return <div className="grid min-h-40 place-items-center"><Loader2 className="size-5 animate-spin" /></div>;
  const session = data.session;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 rounded-xl border bg-muted/15 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Nome" value={session.capturedName || "Não informado"} />
        <Info label="WhatsApp" value={session.capturedPhone || "Não informado"} />
        <Info label="E-mail" value={session.capturedEmail || "Não informado"} />
        <Info label="Origem" value={[session.utmSource, session.utmCampaign].filter(Boolean).join(" / ") || "Direto"} />
      </div>
      <div className="rounded-xl border bg-[#0b141a] p-4 text-white">
        <div className="space-y-2">
          {data.history.map(message => (
            <div key={message.id} className={`flex ${message.direction === "inbound" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[78%] rounded-lg px-3 py-2 text-sm ${message.direction === "inbound" ? "bg-[#005c4b]" : "bg-[#202c33]"}`}>
                {message.contentType === "image" && message.mediaUrl && <img src={message.mediaUrl} className="mb-2 max-h-64 rounded object-cover" />}
                {message.contentType === "video" && message.mediaUrl && <video src={message.mediaUrl} controls className="mb-2 max-h-64 rounded" />}
                {message.contentType === "audio" && message.mediaUrl && <audio src={message.mediaUrl} controls className="mb-2 max-w-full" />}
                <p className="whitespace-pre-wrap">{message.body}</p>
                <div className="mt-1 text-right text-[10px] text-white/40">{new Date(message.createdAt).toLocaleString("pt-BR")}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium">Eventos de conversão</h3>
        {!data.conversions.length ? <p className="text-sm text-muted-foreground">Nenhum evento ainda.</p> : <div className="space-y-2">{data.conversions.map(event => <div key={event.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"><span>{event.eventType}</span><span className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString("pt-BR")}</span></div>)}</div>}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div><div className="mb-1.5 flex items-center justify-between"><Label>{label}</Label>{hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}</div>{children}</div>;
}

function CopyButton({ value }: { value: string }) {
  return <Button variant="outline" size="icon" onClick={async () => { await navigator.clipboard.writeText(value); toast.success("Copiado"); }}><Copy className="size-4" /></Button>;
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-4" /></div><div><div className="text-2xl font-semibold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div></CardContent></Card>;
}

function StatusPill({ status }: { status: string }) {
  const labels: Record<string, string> = { waiting: "Aguardando", active: "Em conversa", completed: "Concluída", converted: "Comprou", archived: "Arquivada" };
  const cls = status === "converted" ? "bg-emerald-500/15 text-emerald-400" : status === "active" ? "bg-blue-500/15 text-blue-400" : "bg-muted text-muted-foreground";
  return <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${cls}`}>{labels[status] || status}</span>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 break-words text-sm font-medium">{value}</div></div>;
}

function splitLines(value: string) {
  return value.split("\n").map(item => item.trim()).filter(Boolean);
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return splitLines(value); }
  }
  return [];
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatDuration(start: Date | null, end: Date) {
  if (!start) return "Não iniciou";
  const seconds = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

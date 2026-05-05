import AppLayout from "@/components/AppLayout";
import { AgentRequired } from "@/components/AgentRequired";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  PhoneCall,
  QrCode,
  RefreshCw,
  Save,
  Smartphone,
  Unplug,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type Mode = "official" | "qr";

export default function WhatsappPage() {
  return (
    <AppLayout>
      <AgentRequired>{agentId => <Inner agentId={agentId} />}</AgentRequired>
    </AppLayout>
  );
}

function Inner({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const { data: agent } = trpc.agents.get.useQuery({ id: agentId });
  const updateAgent = trpc.agents.update.useMutation({
    onSuccess: () => {
      utils.agents.get.invalidate({ id: agentId });
      utils.agents.list.invalidate();
    },
  });

  const mode: Mode = (agent?.connectionMode as Mode) ?? "official";

  const setMode = (m: Mode) => {
    if (m === mode) return;
    updateAgent.mutate(
      { id: agentId, patch: { connectionMode: m } },
      {
        onSuccess: () => {
          toast.success(
            m === "official"
              ? "Modo oficial selecionado"
              : "Modo QR Code selecionado (não oficial)"
          );
        },
      }
    );
  };

  return (
    <div className="container py-10 max-w-3xl">
      <PageHeader
        eyebrow="Integração"
        title="WhatsApp"
        description="Escolha como o agente vai se conectar ao WhatsApp."
      />

      <div className="elevated-card rounded-2xl p-2 mb-6 grid grid-cols-2 gap-2">
        <ModeCard
          active={mode === "official"}
          onClick={() => setMode("official")}
          icon={<PhoneCall className="h-5 w-5" />}
          title="API Oficial (Meta)"
          subtitle="Recomendado para produção"
          tone="emerald"
        />
        <ModeCard
          active={mode === "qr"}
          onClick={() => setMode("qr")}
          icon={<QrCode className="h-5 w-5" />}
          title="Z-API (não oficial)"
          subtitle="Conecta via instância Z-API"
          tone="amber"
        />
      </div>

      {mode === "official" ? (
        <OfficialPanel agentId={agentId} />
      ) : (
        <ZapiPanel agentId={agentId} />
      )}
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  icon,
  title,
  subtitle,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  tone: "emerald" | "amber";
}) {
  const ring = active
    ? tone === "emerald"
      ? "ring-2 ring-accent/60"
      : "ring-2 ring-amber-500/60"
    : "ring-1 ring-border/50";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl px-4 py-3 transition bg-card/60 hover:bg-card/80 ${ring}`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`h-9 w-9 rounded-lg grid place-items-center ${
            tone === "emerald" ? "bg-accent/15 text-accent" : "bg-amber-500/15 text-amber-400"
          }`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="font-medium leading-tight">{title}</div>
          <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
        </div>
      </div>
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────
 *  PAINEL: API OFICIAL META
 * ────────────────────────────────────────────────────────────── */
function OfficialPanel({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const { data } = trpc.whatsapp.getConfig.useQuery({ agentId });
  const save = trpc.whatsapp.saveConfig.useMutation({
    onSuccess: () => {
      utils.whatsapp.getConfig.invalidate({ agentId });
      toast.success("Configuração salva");
    },
  });

  const [form, setForm] = useState({
    phoneNumberId: "",
    businessAccountId: "",
    accessToken: "",
    verifyToken: "",
    appSecret: "",
    displayPhoneNumber: "",
  });

  useEffect(() => {
    if (data) {
      setForm({
        phoneNumberId: data.phoneNumberId ?? "",
        businessAccountId: data.businessAccountId ?? "",
        accessToken: data.accessToken ?? "",
        verifyToken: data.verifyToken ?? "",
        appSecret: data.appSecret ?? "",
        displayPhoneNumber: data.displayPhoneNumber ?? "",
      });
    }
  }, [data]);

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/whatsapp/webhook`
      : "";

  return (
    <>
      <div className="elevated-card rounded-2xl p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Phone Number ID"
            value={form.phoneNumberId}
            onChange={v => setForm({ ...form, phoneNumberId: v })}
            placeholder="123456789012345"
          />
          <Field
            label="WABA ID (Business Account)"
            value={form.businessAccountId}
            onChange={v => setForm({ ...form, businessAccountId: v })}
            placeholder="123456789012345"
          />
          <Field
            label="Número exibido"
            value={form.displayPhoneNumber}
            onChange={v => setForm({ ...form, displayPhoneNumber: v })}
            placeholder="+55 11 99999-9999"
          />
          <Field
            label="Verify Token (você define)"
            value={form.verifyToken}
            onChange={v => setForm({ ...form, verifyToken: v })}
            placeholder="qualquer-string-secreta"
          />
        </div>
        <Field
          label="Access Token (System User permanente)"
          value={form.accessToken}
          onChange={v => setForm({ ...form, accessToken: v })}
          placeholder="EAAG..."
          mono
        />
        <Field
          label="App Secret (verificação de assinatura)"
          value={form.appSecret}
          onChange={v => setForm({ ...form, appSecret: v })}
          placeholder="abc123..."
          mono
        />

        <div className="pt-2 flex justify-end">
          <Button
            onClick={() => save.mutate({ agentId, ...form })}
            disabled={save.isPending}
          >
            <Save className="h-4 w-4 mr-1.5" />
            Salvar
          </Button>
        </div>
      </div>

      <div className="mt-8 elevated-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-accent/15 grid place-items-center text-accent">
            <PhoneCall className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-medium">URL do Webhook</h3>
            <p className="text-xs text-muted-foreground">
              Configure no Meta App Dashboard, em "Webhooks → WhatsApp".
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input value={webhookUrl} readOnly className="font-mono text-xs" />
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              navigator.clipboard.writeText(webhookUrl);
              toast.success("Copiado");
            }}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>1. No painel da Meta, ative o webhook com a URL acima e o Verify Token informado.</p>
          <p>2. Inscreva-se nos campos: <code>messages</code>.</p>
          <p>3. Após verificar, suas mensagens passarão pelo agente automaticamente.</p>
        </div>
      </div>
    </>
  );
}

/* PAINEL: Z-API (não oficial via instância paga) */
function ZapiPanel({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.zapi.get.useQuery({ agentId });
  const upsert = trpc.zapi.upsert.useMutation({
    onSuccess: () => {
      utils.zapi.get.invalidate({ agentId });
      toast.success("Instância Z-API salva");
    },
    onError: e => toast.error(`Erro ao salvar: ${e.message}`),
  });
  const ping = trpc.zapi.ping.useMutation({
    onSuccess: r => {
      utils.zapi.get.invalidate({ agentId });
      if (r.ok && r.connected) {
        toast.success("Instância conectada com sucesso");
      } else if (r.ok) {
        toast.warning("Instância configurada, mas WhatsApp não está pareado");
      } else {
        toast.error(`Falha: ${r.error}`);
      }
    },
    onError: e => toast.error(`Falha ao verificar: ${e.message}`),
  });
  const rotate = trpc.zapi.rotateSecret.useMutation({
    onSuccess: () => {
      utils.zapi.get.invalidate({ agentId });
      toast.success("Webhook secret renovado");
    },
  });
  const disconnect = trpc.zapi.disconnect.useMutation({
    onSuccess: () => {
      utils.zapi.get.invalidate({ agentId });
      toast.success("Instância removida");
    },
  });

  const [form, setForm] = useState({
    instanceId: "",
    token: "",
    clientToken: "",
  });

  useEffect(() => {
    if (data) {
      setForm({
        instanceId: data.instanceId ?? "",
        token: data.token ?? "",
        clientToken: data.clientToken ?? "",
      });
    }
  }, [data]);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const webhookUrl =
    data?.webhookSecret
      ? `${origin}/api/zapi/${agentId}/inbound?secret=${data.webhookSecret}`
      : "";
  const statusUrl =
    data?.webhookSecret
      ? `${origin}/api/zapi/${agentId}/status?secret=${data.webhookSecret}`
      : "";

  const isConfigured = !!data?.instanceId && !!data?.token;
  const isConnected = !!data?.isConnected;

  return (
    <>
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 mb-6 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-100/90">
          <p className="font-medium text-amber-200 mb-1">Atenção: modo não oficial</p>
          <p className="text-xs leading-relaxed">
            Esta conexão usa a Z-API, um serviço de terceiros que faz a ponte
            com o WhatsApp Web. <strong>Viola os Termos da Meta</strong> e o
            número pode ser bloqueado em alto volume. Para produção séria,
            prefira a API Oficial.
          </p>
        </div>
      </div>

      <div className="elevated-card rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">Credenciais Z-API</h3>
            <p className="text-xs text-muted-foreground">
              Cole os dados da instância em &quot;Dados da instância web&quot; no
              painel da Z-API.
            </p>
          </div>
          <ZapiStatusBadge
            connected={isConnected}
            configured={isConfigured}
            loading={isLoading}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="ID da instância"
            value={form.instanceId}
            onChange={v => setForm({ ...form, instanceId: v })}
            placeholder="3F2AD05C995C523918BB76F7F124D212"
            mono
          />
          <Field
            label="Token da instância"
            value={form.token}
            onChange={v => setForm({ ...form, token: v })}
            placeholder="44D76761D30B593D2353DB27"
            mono
          />
        </div>
        <Field
          label="Client-Token (opcional, em Conta → Segurança)"
          value={form.clientToken}
          onChange={v => setForm({ ...form, clientToken: v })}
          placeholder="Fa45..."
          mono
        />

        <div className="pt-2 flex justify-between gap-2">
          <Button
            variant="outline"
            onClick={() => disconnect.mutate({ agentId })}
            disabled={disconnect.isPending || !isConfigured}
            className="text-destructive hover:text-destructive"
          >
            <Unplug className="h-4 w-4 mr-1.5" />
            Desconectar
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => ping.mutate({ agentId })}
              disabled={ping.isPending || !isConfigured}
            >
              {ping.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1.5" />
              )}
              Verificar conexão
            </Button>
            <Button
              onClick={() =>
                upsert.mutate({
                  agentId,
                  instanceId: form.instanceId.trim(),
                  token: form.token.trim(),
                  clientToken: form.clientToken.trim() || null,
                })
              }
              disabled={
                upsert.isPending ||
                !form.instanceId.trim() ||
                !form.token.trim()
              }
            >
              <Save className="h-4 w-4 mr-1.5" />
              Salvar
            </Button>
          </div>
        </div>

        {data?.lastError && !isConnected && (
          <div className="text-xs text-destructive/80 pt-1">
            Último erro: {data.lastError}
          </div>
        )}
        {data?.connectedPhone && (
          <div className="text-xs text-muted-foreground pt-1">
            Número conectado: <span className="text-foreground font-mono">+{data.connectedPhone}</span>
          </div>
        )}
      </div>

      <div className="mt-6 elevated-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-500/15 grid place-items-center text-amber-400">
            <PhoneCall className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium">URL do Webhook (configurar na Z-API)</h3>
            <p className="text-xs text-muted-foreground">
              Aba &quot;Webhooks e configurações gerais&quot; → cole no campo
              &quot;Ao receber&quot;.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => rotate.mutate({ agentId })}
            disabled={rotate.isPending || !isConfigured}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Renovar secret
          </Button>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Ao receber</Label>
          <div className="flex items-center gap-2">
            <Input
              value={webhookUrl}
              readOnly
              className="font-mono text-xs"
              placeholder="Salve as credenciais primeiro"
            />
            <Button
              variant="outline"
              size="icon"
              disabled={!webhookUrl}
              onClick={() => {
                navigator.clipboard.writeText(webhookUrl);
                toast.success("Copiado");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <Label className="text-xs">Ao conectar / Ao desconectar (opcional)</Label>
          <div className="flex items-center gap-2">
            <Input
              value={statusUrl}
              readOnly
              className="font-mono text-xs"
              placeholder="Salve as credenciais primeiro"
            />
            <Button
              variant="outline"
              size="icon"
              disabled={!statusUrl}
              onClick={() => {
                navigator.clipboard.writeText(statusUrl);
                toast.success("Copiado");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="text-xs text-muted-foreground space-y-1 pt-2">
          <p>1. Ative <strong>&quot;Notificar as enviadas por mim também&quot;</strong> desligado para não receber eco.</p>
          <p>2. Mantenha <strong>&quot;Ler mensagens automático&quot;</strong> ligado.</p>
          <p>3. Use <strong>Verificar conexão</strong> para confirmar que está pareado antes de enviar.</p>
        </div>
      </div>
    </>
  );
}

function ZapiStatusBadge({
  connected,
  configured,
  loading,
}: {
  connected: boolean;
  configured: boolean;
  loading: boolean;
}) {
  if (loading) {
    return (
      <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Carregando
      </span>
    );
  }
  if (!configured) {
    return (
      <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
        <XCircle className="h-3.5 w-3.5" />
        Não configurado
      </span>
    );
  }
  return connected ? (
    <span className="text-xs inline-flex items-center gap-1.5 text-emerald-400">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Conectado
    </span>
  ) : (
    <span className="text-xs inline-flex items-center gap-1.5 text-amber-400">
      <AlertTriangle className="h-3.5 w-3.5" />
      Desconectado
    </span>
  );
}

/* QrPanel legado mantido para compatibilidade interna (não roteado) */
function _QrPanelLegacy({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.qr.status.useQuery(
    { agentId },
    { refetchInterval: 2000 }
  );
  const start = trpc.qr.start.useMutation({
    onSuccess: () => utils.qr.status.invalidate({ agentId }),
    onError: (e) => toast.error(`Falha ao iniciar conexão: ${e.message}`),
  });
  const disconnect = trpc.qr.disconnect.useMutation({
    onSuccess: () => {
      utils.qr.status.invalidate({ agentId });
      toast.success("Sessão encerrada");
    },
  });

  const status = data?.status ?? "disconnected";

  // Notificação de sucesso/falha: dispara um toast UMA vez quando o status
  // transita para `connected` ou para um estado terminal de falha. Evita
  // toast spam usando um ref que guarda o último status notificado.
  const lastNotifiedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    const prev = lastNotifiedRef.current;
    if (prev === status) return;
    if (status === "connected" && prev !== "connected") {
      const who = data.displayName ?? data.jid?.split("@")[0] ?? "WhatsApp";
      toast.success(`Conectado com sucesso a ${who}`);
    } else if (
      (status === "logged_out" || status === "banned") &&
      prev !== status
    ) {
      toast.error(
        `Falha na conexão WhatsApp: ${data.lastError ?? status}. Clique em "Iniciar conexão" para tentar novamente.`,
      );
    } else if (
      status === "disconnected" &&
      prev === "connected"
    ) {
      toast.warning(
        `WhatsApp desconectado${data.lastError ? `: ${data.lastError}` : ""}. Clique em "Iniciar conexão" para reconectar.`,
      );
    }
    lastNotifiedRef.current = status;
  }, [status, data]);
  const lastQr = data?.lastQr ?? null;
  const jid = data?.jid ?? null;
  const displayName = data?.displayName ?? null;

  const phone = useMemo(() => {
    if (!jid) return null;
    const raw = jid.split("@")[0]?.split(":")[0] ?? "";
    if (!raw) return null;
    // formata BR se possível (12-13 dígitos)
    if (raw.length >= 12 && raw.startsWith("55")) {
      const cc = raw.slice(0, 2);
      const ddd = raw.slice(2, 4);
      const p1 = raw.slice(4, raw.length - 4);
      const p2 = raw.slice(-4);
      return `+${cc} (${ddd}) ${p1}-${p2}`;
    }
    return `+${raw}`;
  }, [jid]);

  return (
    <>
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 mb-6 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-100/90">
          <p className="font-medium text-amber-200 mb-1">Atenção: modo não oficial</p>
          <p className="text-xs leading-relaxed">
            Esta conexão usa engenharia reversa do WhatsApp Web (biblioteca
            Baileys) e <strong>viola os Termos de Serviço da Meta</strong>. O
            número conectado pode ser bloqueado, especialmente em alto volume,
            disparos em massa ou comportamento automatizado evidente. Para
            produção séria, prefira a API Oficial.
          </p>
        </div>
      </div>

      <div className="elevated-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-medium">Conexão por celular</h3>
            <p className="text-xs text-muted-foreground">
              Escaneie o QR Code abaixo no seu WhatsApp em
              <span className="text-foreground"> Configurações → Aparelhos conectados → Conectar um aparelho</span>.
            </p>
          </div>
          <StatusBadge status={status} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[280px,1fr] gap-6">
          <div className="rounded-xl border border-border/60 bg-card/60 aspect-square grid place-items-center overflow-hidden">
            {status === "connected" ? (
              <div className="text-center p-6">
                <CheckCircle2 className="h-14 w-14 text-accent mx-auto mb-3" />
                <p className="text-sm font-medium">Conectado</p>
                {phone && <p className="text-xs text-muted-foreground mt-1">{phone}</p>}
                {displayName && (
                  <p className="text-xs text-muted-foreground">{displayName}</p>
                )}
              </div>
            ) : lastQr ? (
              <img
                src={lastQr}
                alt="QR Code WhatsApp"
                className="w-full h-full object-contain p-3 bg-white rounded-xl"
              />
            ) : status === "connecting" || status === "awaiting_qr" ? (
              <div className="text-center p-6 text-muted-foreground">
                <Loader2 className="h-10 w-10 animate-spin mx-auto mb-3" />
                <p className="text-sm">Gerando QR Code...</p>
              </div>
            ) : status === "banned" ? (
              <div className="text-center p-6">
                <XCircle className="h-12 w-12 text-destructive mx-auto mb-3" />
                <p className="text-sm font-medium text-destructive">Número banido</p>
                <p className="text-xs text-muted-foreground mt-1">
                  O WhatsApp encerrou a sessão.
                </p>
              </div>
            ) : (
              <div className="text-center p-6 text-muted-foreground">
                <QrCode className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p className="text-sm">
                  {isLoading ? "Carregando..." : "Nenhuma sessão ativa"}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="text-sm space-y-2">
              <Step n={1}>Toque em <strong>Iniciar conexão</strong>.</Step>
              <Step n={2}>
                Abra o WhatsApp no celular do número que vai atender.
              </Step>
              <Step n={3}>
                Vá em <em>Configurações → Aparelhos conectados → Conectar um aparelho</em>.
              </Step>
              <Step n={4}>Aponte a câmera para o QR Code ao lado.</Step>
              <Step n={5}>
                Quando conectar, o agente passa a responder automaticamente
                pelo seu número.
              </Step>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {status === "connected" ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => disconnect.mutate({ agentId, wipe: false })}
                    disabled={disconnect.isPending}
                  >
                    <Unplug className="h-4 w-4 mr-1.5" />
                    Desconectar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => disconnect.mutate({ agentId, wipe: true })}
                    disabled={disconnect.isPending}
                    className="text-destructive hover:text-destructive"
                  >
                    <XCircle className="h-4 w-4 mr-1.5" />
                    Encerrar e apagar sessão
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={() => start.mutate({ agentId })} disabled={start.isPending}>
                    {start.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Smartphone className="h-4 w-4 mr-1.5" />
                    )}
                    Iniciar conexão
                  </Button>
                  {(status === "logged_out" ||
                    status === "banned" ||
                    status === "disconnected" ||
                    !!data?.lastError) && (
                    <Button
                      variant="outline"
                      onClick={() => disconnect.mutate({ agentId, wipe: true })}
                      disabled={disconnect.isPending}
                    >
                      <RefreshCw className="h-4 w-4 mr-1.5" />
                      Apagar sessão antiga
                    </Button>
                  )}
                </>
              )}
            </div>

            {data?.lastError && status !== "connected" && (
              <div className="mt-2 text-xs space-y-1">
                <p className="text-destructive/80">
                  Último erro: {data.lastError}
                </p>
                {/connection failure|stream error|conflict|timeout|forbidden/i.test(
                  data.lastError
                ) && (
                  <p className="text-muted-foreground">
                    Sessão anterior expirou ou foi invalidada pelo WhatsApp.
                    Clique em <strong>Apagar sessão antiga</strong> e depois
                    em <strong>Iniciar conexão</strong> para gerar um novo QR.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 elevated-card rounded-2xl p-5 text-xs text-muted-foreground space-y-2">
        <p>
          • A sessão é mantida no servidor. Se reiniciar, o agente reconecta
          sozinho — você não precisa escanear de novo.
        </p>
        <p>
          • Mensagens recebidas e enviadas usam o mesmo cérebro, etapas, mídias
          e regras de follow-up que você configurou.
        </p>
        <p>
          • Em modo QR Code, <strong>templates HSM e janela de 24h não se
          aplicam</strong> — o follow-up envia a mensagem livremente.
        </p>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    connected: { label: "Conectado", cls: "bg-accent/15 text-accent border-accent/30" },
    awaiting_qr: { label: "Aguardando leitura", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
    connecting: { label: "Conectando", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
    disconnected: { label: "Desconectado", cls: "bg-muted text-muted-foreground border-border" },
    logged_out: { label: "Sessão expirada", cls: "bg-muted text-muted-foreground border-border" },
    banned: { label: "Banido", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  };
  const m = map[status] ?? map.disconnected;
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full border ${m.cls}`}>{m.label}</span>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="h-5 w-5 rounded-full bg-accent/15 text-accent text-[10px] font-semibold grid place-items-center shrink-0 mt-0.5">
        {n}
      </span>
      <div className="text-sm text-muted-foreground leading-relaxed">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={mono ? "font-mono text-xs" : ""}
      />
    </div>
  );
}

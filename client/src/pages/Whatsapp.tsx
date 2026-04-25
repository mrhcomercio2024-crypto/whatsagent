import AppLayout from "@/components/AppLayout";
import { AgentRequired } from "@/components/AgentRequired";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Copy, PhoneCall, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function WhatsappPage() {
  return (
    <AppLayout>
      <AgentRequired>{agentId => <Inner agentId={agentId} />}</AgentRequired>
    </AppLayout>
  );
}

function Inner({ agentId }: { agentId: number }) {
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

  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/whatsapp/webhook` : "";

  return (
    <div className="container py-10 max-w-3xl">
      <PageHeader
        eyebrow="Integração"
        title="WhatsApp Cloud API"
        description="Conecte seu número WhatsApp Business através da API oficial da Meta. As credenciais ficam armazenadas com segurança."
      />

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
          <Button onClick={() => save.mutate({ agentId, ...form })} disabled={save.isPending}>
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

import AppLayout from "@/components/AppLayout";
import { AgentRequired } from "@/components/AgentRequired";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Save, ShieldOff, X, Plus } from "lucide-react";
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
            <div key={f.key} className="elevated-card rounded-2xl p-6 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{f.label}</Label>
              </div>
              <p className="text-xs text-muted-foreground">{f.description}</p>
              <Textarea
                rows={f.rows}
                value={form[f.key]}
                onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                className="font-mono text-sm leading-relaxed bg-background/40"
              />
            </div>
          ))
        )}
        <RestrictedTermsSection agentId={agentId} />
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

import AppLayout from "@/components/AppLayout";
import { AgentRequired } from "@/components/AgentRequired";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
      </div>
    </div>
  );
}

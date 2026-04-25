import AppLayout from "@/components/AppLayout";
import { AgentRequired } from "@/components/AgentRequired";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Download, Flame, Snowflake, Sun, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function LeadsPage() {
  return (
    <AppLayout>
      <AgentRequired>{agentId => <Inner agentId={agentId} />}</AgentRequired>
    </AppLayout>
  );
}

function Inner({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const { data: leads } = trpc.leads.list.useQuery({ agentId });
  const update = trpc.leads.update.useMutation({
    onSuccess: () => utils.leads.list.invalidate({ agentId }),
  });
  const csvUtils = trpc.useUtils();
  async function exportCsv() {
    const data = await csvUtils.leads.exportCsv.fetch({ agentId });
    const blob = new Blob([data as string], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-agent-${agentId}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  }
  const [filter, setFilter] = useState<string>("all");

  const filtered = (leads ?? []).filter(l => {
    if (filter === "all") return true;
    return l.temperature === filter;
  });

  return (
    <div className="container py-10">
      <PageHeader
        eyebrow="CRM"
        title="Leads"
        description="Cada conversa de WhatsApp gera um lead aqui. Você pode editar, requalificar e exportar."
        actions={
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="hot">Quentes</SelectItem>
                <SelectItem value="warm">Mornos</SelectItem>
                <SelectItem value="cold">Frios</SelectItem>
                <SelectItem value="unknown">Não qualificados</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => exportCsv()}>
              <Download className="h-4 w-4 mr-1.5" />
              Exportar CSV
            </Button>
          </div>
        }
      />

      {!leads || leads.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="Nenhum lead ainda"
          description="Os leads aparecem aqui assim que o WhatsApp começar a receber mensagens."
        />
      ) : (
        <div className="elevated-card rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-background/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Nome</th>
                <th className="text-left px-4 py-3">Telefone</th>
                <th className="text-left px-4 py-3">Temperatura</th>
                <th className="text-left px-4 py-3">Tags</th>
                <th className="text-left px-4 py-3">Criado</th>
                <th className="text-left px-4 py-3">Notas</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id} className="border-t border-border/30 hover:bg-sidebar-accent/30">
                  <td className="px-4 py-3">
                    <Input
                      defaultValue={l.name ?? ""}
                      onBlur={e => {
                        if (e.target.value !== (l.name ?? "")) {
                          update.mutate({ id: l.id, patch: { name: e.target.value || null } });
                        }
                      }}
                      className="h-8 bg-transparent border-transparent hover:border-border focus:border-border"
                      placeholder="Sem nome"
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{l.phoneNumber}</td>
                  <td className="px-4 py-3">
                    <Select
                      value={l.temperature}
                      onValueChange={(v: any) => update.mutate({ id: l.id, patch: { temperature: v } })}
                    >
                      <SelectTrigger className="h-8 w-[130px] bg-transparent">
                        <TempBadge t={l.temperature} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hot">Quente</SelectItem>
                        <SelectItem value="warm">Morno</SelectItem>
                        <SelectItem value="cold">Frio</SelectItem>
                        <SelectItem value="unknown">Sem qualificação</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      defaultValue={l.tags ?? ""}
                      onBlur={e => {
                        if (e.target.value !== (l.tags ?? "")) {
                          update.mutate({ id: l.id, patch: { tags: e.target.value || null } });
                        }
                      }}
                      placeholder="ex.: vip, agendou"
                      className="h-8 bg-transparent border-transparent hover:border-border focus:border-border"
                    />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(l.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">
                    {l.qualificationNotes ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TempBadge({ t }: { t: string }) {
  if (t === "hot")
    return (
      <Badge className="bg-destructive/15 text-destructive border-destructive/20 text-[10px]">
        <Flame className="h-2.5 w-2.5 mr-1" />
        quente
      </Badge>
    );
  if (t === "warm")
    return (
      <Badge className="bg-accent/15 text-accent border-accent/20 text-[10px]">
        <Sun className="h-2.5 w-2.5 mr-1" />
        morno
      </Badge>
    );
  if (t === "cold")
    return (
      <Badge variant="outline" className="text-[10px]">
        <Snowflake className="h-2.5 w-2.5 mr-1" />
        frio
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground">
      sem qualif.
    </Badge>
  );
}

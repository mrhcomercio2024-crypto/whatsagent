import AppLayout from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { LogOut } from "lucide-react";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  return (
    <AppLayout>
      <div className="container py-10 max-w-3xl space-y-8">
        <PageHeader
          eyebrow="Conta"
          title="Configurações"
          description="Informações da sua sessão e preferências da plataforma."
        />
        <section className="elevated-card rounded-2xl p-6 space-y-3">
          <h3 className="font-medium">Sessão</h3>
          {user ? (
            <div className="text-sm text-muted-foreground space-y-1">
              <p><span className="text-foreground">Nome:</span> {user.name ?? "—"}</p>
              <p><span className="text-foreground">E-mail:</span> {user.email ?? "—"}</p>
              <p><span className="text-foreground">Papel:</span> {user.role}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Você não está autenticado.</p>
          )}
          <div className="pt-2">
            <Button variant="outline" onClick={() => logout()}>
              <LogOut className="h-4 w-4 mr-1.5" />
              Sair
            </Button>
          </div>
        </section>

        <section className="elevated-card rounded-2xl p-6 space-y-3">
          <h3 className="font-medium">Self-hosting</h3>
          <p className="text-sm text-muted-foreground">
            Esta plataforma foi construída para você levar para sua própria infraestrutura. O código
            roda em qualquer Node.js 22+ com MySQL/TiDB. Variáveis necessárias:
          </p>
          <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
            <li><code>DATABASE_URL</code></li>
            <li><code>JWT_SECRET</code></li>
            <li><code>BUILT_IN_FORGE_API_KEY</code> e <code>BUILT_IN_FORGE_API_URL</code> (proxy LLM) — substituível pelo seu provedor</li>
            <li>Por agente, <code>WhatsApp Cloud API</code>: <code>phoneNumberId</code>, <code>businessAccountId</code>, <code>accessToken</code>, <code>verifyToken</code>, <code>appSecret</code> (configurados na tela WhatsApp)</li>
          </ul>
          <p className="text-xs text-muted-foreground">
            Veja o arquivo <code>SELF_HOSTING.md</code> entregue junto ao código para o passo a
            passo completo.
          </p>
        </section>
      </div>
    </AppLayout>
  );
}

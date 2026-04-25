import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import {
  ArrowRight,
  Bot,
  Boxes,
  Brain,
  Cog,
  Image as ImageIcon,
  MessageSquare,
  Sparkles,
  Zap,
} from "lucide-react";
import { Link } from "wouter";

export default function Home() {
  const { isAuthenticated, loading } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="container flex items-center justify-between py-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-primary text-primary-foreground grid place-items-center font-semibold">
            W
          </div>
          <span className="font-serif text-lg tracking-tight">WhatsAgent</span>
        </div>
        <div className="flex items-center gap-2">
          {!loading && (
            isAuthenticated ? (
              <Link href="/dashboard">
                <Button>
                  Abrir painel
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </Link>
            ) : (
              <a href={getLoginUrl()}>
                <Button>Entrar</Button>
              </a>
            )
          )}
        </div>
      </header>

      <section className="container pt-16 pb-24 grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary/80 font-medium">
            Plataforma de Agentes IA · WhatsApp Cloud API oficial
          </p>
          <h1 className="font-serif text-5xl md:text-6xl leading-[1.05] mt-4 tracking-tight">
            Atendimento de WhatsApp{" "}
            <span className="text-primary">amarrado</span> ao seu script.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
            Desenhe o cérebro do agente, defina etapas obrigatórias, dispare mídias por palavra-chave
            e configure follow-ups com ou sem template — tudo pela interface, sem tocar em uma linha
            de código. Self-hosted, escolha o LLM por etapa.
          </p>
          <div className="mt-8 flex items-center gap-3">
            {!loading && (
              isAuthenticated ? (
                <Link href="/dashboard">
                  <Button size="lg">
                    Abrir painel
                    <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Button>
                </Link>
              ) : (
                <a href={getLoginUrl()}>
                  <Button size="lg">Começar agora</Button>
                </a>
              )
            )}
            <Link href="/agents">
              <Button size="lg" variant="outline">
                Criar primeiro agente
              </Button>
            </Link>
          </div>
        </div>
        <div className="relative">
          <div className="absolute -inset-12 bg-primary/10 blur-3xl rounded-full" />
          <div className="relative elevated-card rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <Bot className="h-4 w-4 text-primary" />
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Agente Vendas Premium
              </span>
            </div>
            <Bubble side="left">Oi, vi o anúncio. Quanto custa?</Bubble>
            <Bubble side="right">
              Que bom que você veio! Antes de te passar valores, posso te perguntar o que mais te
              chamou atenção?
            </Bubble>
            <Bubble side="left">Quero algo pra usar no meu time de vendas</Bubble>
            <Bubble side="right">
              Perfeito. Tenho algo bem alinhado. Olha esse vídeo de 30s:
              <span className="block mt-1 text-[11px] opacity-70">
                [vídeo enviado por gatilho 'time']
              </span>
            </Bubble>
          </div>
        </div>
      </section>

      <section className="container py-16 border-t border-border/40">
        <div className="grid md:grid-cols-3 gap-6">
          <Feature
            icon={<Brain />}
            title="Cérebro + Etapas amarradas"
            text="Persona, regras, produtos, objeções e etapas obrigatórias do script. A IA segue à risca."
          />
          <Feature
            icon={<ImageIcon />}
            title="Mídias por gatilho"
            text="Imagens e vídeos disparados por palavra-chave do lead, etapa do script ou decisão da IA."
          />
          <Feature
            icon={<Zap />}
            title="Follow-ups configuráveis"
            text="Defina intervalos, número de tentativas e se a mensagem usa template aprovado ou texto livre."
          />
          <Feature
            icon={<MessageSquare />}
            title="Inbox em tempo real"
            text="Assuma manualmente quando quiser. Pause a IA, responda, devolva o controle."
          />
          <Feature
            icon={<Boxes />}
            title="LLM por etapa"
            text="Escolha modelos diferentes para qualificação, fechamento ou follow-up — todos disponíveis."
          />
          <Feature
            icon={<Cog />}
            title="Self-hosted"
            text="Código aberto na sua mão. Hospede em servidor próprio com MySQL/TiDB e Node 22."
          />
        </div>
      </section>

      <footer className="container py-10 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" />
          WhatsAgent · feito para parecer humano
        </span>
        <span>© {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}

function Bubble({ side, children }: { side: "left" | "right"; children: React.ReactNode }) {
  const isRight = side === "right";
  return (
    <div className={`flex ${isRight ? "justify-end" : "justify-start"}`}>
      <div
        className={`text-sm rounded-2xl px-4 py-2.5 max-w-[85%] ${
          isRight
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-card text-card-foreground rounded-bl-sm border border-border/40"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function Feature({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="elevated-card rounded-2xl p-6">
      <div className="h-10 w-10 rounded-xl bg-primary/15 text-primary grid place-items-center">
        {icon}
      </div>
      <h3 className="font-serif text-xl mt-4">{title}</h3>
      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{text}</p>
    </div>
  );
}

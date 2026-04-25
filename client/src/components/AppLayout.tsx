import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { useAgent } from "@/contexts/AgentContext";
import { trpc } from "@/lib/trpc";
import {
  Inbox,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Brain,
  ListOrdered,
  BookOpen,
  ImagePlay,
  PhoneCall,
  Clock,
  AlarmClockCheck,
  TestTube2,
  Users,
  Settings,
  Sparkles,
  DollarSign,
} from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "./ui/button";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const groups: Array<{
  label: string;
  items: Array<{ icon: any; label: string; path: string }>;
}> = [
  {
    label: "Operação",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
      { icon: MessageSquare, label: "Chat", path: "/chat" },
      { icon: Users, label: "Leads", path: "/leads" },
      { icon: TestTube2, label: "Simulador", path: "/simulator" },
      { icon: DollarSign, label: "Custos", path: "/costs" },
    ],
  },
  {
    label: "Configuração do Agente",
    items: [
      { icon: Brain, label: "Cérebro", path: "/brain" },
      { icon: ListOrdered, label: "Etapas do script", path: "/steps" },
      { icon: BookOpen, label: "Base de conhecimento", path: "/knowledge" },
      { icon: ImagePlay, label: "Mídias e gatilhos", path: "/media" },
      { icon: AlarmClockCheck, label: "Follow-ups", path: "/followups" },
    ],
  },
  {
    label: "WhatsApp & Operação",
    items: [
      { icon: PhoneCall, label: "WhatsApp Cloud API", path: "/whatsapp" },
      { icon: MessageSquare, label: "Templates HSM", path: "/templates" },
      { icon: Clock, label: "Horário & Handoff", path: "/ops" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { icon: Sparkles, label: "Agentes", path: "/agents" },
      { icon: Settings, label: "Ajustes", path: "/settings" },
    ],
  },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="elevated-card rounded-2xl p-10 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <div className="h-12 w-12 rounded-2xl bg-primary/15 grid place-items-center">
              <MessageSquare className="h-6 w-6 text-primary" />
            </div>
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-serif">WhatsAgent</h1>
              <p className="text-sm text-muted-foreground max-w-sm">
                Plataforma de Agente de IA para WhatsApp. Faça login para acessar o painel.
              </p>
            </div>
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                window.location.href = getLoginUrl();
              }}
            >
              Entrar
            </Button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <SidebarProvider style={{ "--sidebar-width": "276px" } as React.CSSProperties}>
      <AppLayoutInner>{children}</AppLayoutInner>
    </SidebarProvider>
  );
}

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const { selectedAgentId, setSelectedAgentId } = useAgent();
  const { data: agents } = trpc.agents.list.useQuery();

  // Auto-selecionar o primeiro agente disponível
  useEffect(() => {
    if (!selectedAgentId && agents && agents.length > 0) {
      setSelectedAgentId(agents[0].id);
    }
  }, [agents, selectedAgentId, setSelectedAgentId]);

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="h-16 px-3 justify-center border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/15 grid place-items-center shrink-0">
              <MessageSquare className="h-4.5 w-4.5 text-primary" />
            </div>
            <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
              <span className="font-semibold tracking-tight">WhatsAgent</span>
              <span className="text-[11px] text-muted-foreground">
                Agente de IA · WhatsApp Cloud API
              </span>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="gap-0">
          {/* Seletor de agente ativo */}
          <div className="px-3 pt-3 pb-2 group-data-[collapsible=icon]:hidden">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
              Agente ativo
            </p>
            <Select
              value={selectedAgentId ? String(selectedAgentId) : ""}
              onValueChange={v => setSelectedAgentId(parseInt(v, 10))}
            >
              <SelectTrigger className="h-9 bg-sidebar-accent/50 border-sidebar-border">
                <SelectValue placeholder="Selecione um agente" />
              </SelectTrigger>
              <SelectContent>
                {(agents ?? []).map(a => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                  </SelectItem>
                ))}
                {(!agents || agents.length === 0) && (
                  <SelectItem value="none" disabled>
                    Nenhum agente cadastrado
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {groups.map(group => (
            <div key={group.label} className="px-2 pt-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-3 pb-1.5 group-data-[collapsible=icon]:hidden">
                {group.label}
              </p>
              <SidebarMenu>
                {group.items.map(item => {
                  const isActive = location === item.path || location.startsWith(item.path + "/");
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => setLocation(item.path)}
                        tooltip={item.label}
                        className="h-9 font-normal"
                      >
                        <item.icon className={`h-4 w-4 ${isActive ? "text-primary" : ""}`} />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </div>
          ))}
        </SidebarContent>

        <SidebarFooter className="p-3 border-t border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-sidebar-accent transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none">
                <Avatar className="h-9 w-9 border shrink-0">
                  <AvatarFallback className="text-xs font-medium bg-primary/15 text-primary">
                    {user?.name?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                  <p className="text-sm font-medium truncate leading-none">{user?.name || "-"}</p>
                  <p className="text-xs text-muted-foreground truncate mt-1.5">
                    {user?.email || "-"}
                  </p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={logout}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sair</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg" />
              <span className="tracking-tight text-foreground font-medium">WhatsAgent</span>
            </div>
          </div>
        )}
        <main className="flex-1 min-h-screen">{children}</main>
      </SidebarInset>
    </>
  );
}

// Re-export Link to avoid unused import warning
export { Link };

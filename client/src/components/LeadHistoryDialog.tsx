import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  ArrowRight,
  Bot,
  Flag,
  History,
  MessageSquare,
  Pause,
  Play,
  Send,
  Sparkles,
  Tag,
  Timer,
  User,
  UserCog,
  FileText,
  Loader2,
} from "lucide-react";

type Event = {
  id: string;
  kind: string;
  at: string | Date;
  title: string;
  detail?: string | null;
  meta?: Record<string, unknown> | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: number | null;
  leadName?: string | null;
}

/**
 * Modal com timeline vertical de eventos passados do lead.
 * Agrupa por dia e usa ícones coloridos para cada tipo de evento.
 */
export function LeadHistoryDialog({ open, onOpenChange, leadId, leadName }: Props) {
  const { data, isLoading, isError } = trpc.leads.history.useQuery(
    { leadId: leadId ?? 0, limit: 200 },
    { enabled: open && !!leadId }
  );

  const grouped = useMemo(() => {
    if (!data) return [] as { day: string; events: Event[] }[];
    const map = new Map<string, Event[]>();
    for (const e of data as Event[]) {
      const d = new Date(e.at);
      const key = d.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([day, events]) => ({ day, events }));
  }, [data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0 bg-card">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 grid place-items-center">
              <History className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-xl font-serif">Histórico do Lead</DialogTitle>
              <DialogDescription className="mt-0.5 truncate">
                {leadName
                  ? `Linha do tempo de ${leadName}`
                  : "Linha do tempo de interações"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {isLoading && (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico…
            </div>
          )}
          {isError && (
            <div className="text-center text-sm text-destructive py-10">
              Não foi possível carregar o histórico.
            </div>
          )}
          {!isLoading && !isError && grouped.length === 0 && (
            <div className="text-center py-16 space-y-2">
              <History className="h-10 w-10 mx-auto text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">
                Nenhum evento registrado ainda para este lead.
              </p>
            </div>
          )}

          {grouped.map(({ day, events }) => (
            <div key={day} className="mb-6 last:mb-0">
              <div className="sticky top-0 z-10 -mx-6 px-6 py-2 bg-card/95 backdrop-blur border-b border-border/40 mb-4">
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
                  {day}
                </p>
              </div>
              <ol className="relative border-l border-border/50 ml-3 space-y-5">
                {events.map((e) => (
                  <TimelineItem key={e.id} event={e} />
                ))}
              </ol>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TimelineItem({ event }: { event: Event }) {
  const { icon: Icon, color, label } = kindStyle(event.kind);
  const time = new Date(event.at).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <li className="ml-6 relative">
      <span
        className="absolute -left-[34px] top-0.5 h-6 w-6 rounded-full grid place-items-center ring-4 ring-card"
        style={{ backgroundColor: color + "22", color }}
      >
        <Icon className="h-3 w-3" strokeWidth={2.5} />
      </span>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium">{event.title}</p>
            {label && (
              <Badge
                variant="outline"
                className="text-[10px] h-4 px-1.5 font-normal"
                style={{ borderColor: color + "55", color }}
              >
                {label}
              </Badge>
            )}
          </div>
          {event.detail && (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed break-words">
              {event.detail}
            </p>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums mt-0.5">
          {time}
        </span>
      </div>
    </li>
  );
}

function kindStyle(kind: string): {
  icon: typeof MessageSquare;
  color: string;
  label: string | null;
} {
  switch (kind) {
    case "message_in":
      return { icon: MessageSquare, color: "#a1a1aa", label: "Lead" };
    case "message_out_ai":
      return { icon: Bot, color: "#10b981", label: "IA" };
    case "message_out_human":
      return { icon: User, color: "#38bdf8", label: "Humano" };
    case "message_template":
      return { icon: FileText, color: "#eab308", label: "Template" };
    case "step_advance":
      return { icon: ArrowRight, color: "#8b5cf6", label: "Etapa" };
    case "handoff":
      return { icon: UserCog, color: "#f97316", label: "Handoff" };
    case "ai_paused":
      return { icon: Pause, color: "#f59e0b", label: "IA" };
    case "ai_resumed":
      return { icon: Play, color: "#22c55e", label: "IA" };
    case "status_tag":
      return { icon: Tag, color: "#ef4444", label: "Status" };
    case "qualification":
      return { icon: Sparkles, color: "#e879f9", label: "Qualificação" };
    case "followup":
      return { icon: Timer, color: "#0ea5e9", label: "Follow-up" };
    default:
      return { icon: Flag, color: "#71717a", label: null };
  }
}

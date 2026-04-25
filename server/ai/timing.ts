/**
 * Lógica de horário de atendimento e janela de 24h da Meta.
 */
import type { BusinessHours, Conversation } from "../../drizzle/schema";

type Weekly = Record<string, { start: string; end: string; closed?: boolean }>;

/**
 * Verifica se o horário atual está dentro do expediente do agente.
 */
export function isWithinBusinessHours(
  bh: BusinessHours | undefined,
  now: Date = new Date()
): boolean {
  if (!bh || !bh.enabled) return true;
  try {
    const tz = bh.timezone || "America/Sao_Paulo";
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const wd = parts.find(p => p.type === "weekday")?.value || "";
    const hh = parts.find(p => p.type === "hour")?.value || "00";
    const mm = parts.find(p => p.type === "minute")?.value || "00";
    const dayMap: Record<string, string> = {
      Sun: "0", Mon: "1", Tue: "2", Wed: "3", Thu: "4", Fri: "5", Sat: "6",
    };
    const dayKey = dayMap[wd];
    const weekly = (bh.weekly as Weekly | null) || {};
    const slot = dayKey ? weekly[dayKey] : undefined;
    if (!slot || slot.closed) return false;
    const cur = `${hh}:${mm}`;
    return cur >= (slot.start || "00:00") && cur <= (slot.end || "23:59");
  } catch {
    return true;
  }
}

/**
 * A janela de 24h da Meta exige que após 24h sem mensagem do lead,
 * apenas templates aprovados (HSM) possam ser enviados.
 */
export function isInside24hWindow(
  conv: Pick<Conversation, "lastInboundAt"> | undefined,
  now: Date = new Date()
): boolean {
  if (!conv?.lastInboundAt) return false;
  const elapsed = now.getTime() - new Date(conv.lastInboundAt).getTime();
  return elapsed < 24 * 60 * 60 * 1000;
}

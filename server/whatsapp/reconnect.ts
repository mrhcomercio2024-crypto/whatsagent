/**
 * Lógica de reconexão "production-grade" para sessões Baileys.
 *
 * - Backoff exponencial com jitter, com cap configurável
 * - Cancelamento de tentativa pendente
 * - Funções puras testáveis (computeBackoffMs, scheduler)
 *
 * NÃO importa `./baileys` para evitar ciclos de importação. Quem chama
 * passa a função `attempt` (= `startQrSession`) por injeção.
 */

export type BackoffOptions = {
  /** Delay inicial em ms (1ª tentativa). Default 1500. */
  baseMs?: number;
  /** Delay máximo em ms. Default 60_000. */
  capMs?: number;
  /** Multiplicador a cada tentativa. Default 2. */
  factor?: number;
  /** Jitter máximo em ms (somado/subtraído). Default 500. */
  jitterMs?: number;
};

const DEFAULTS: Required<BackoffOptions> = {
  baseMs: 1500,
  capMs: 60_000,
  factor: 2,
  jitterMs: 500,
};

/**
 * Calcula o delay para a tentativa N (1-indexed) usando backoff exponencial
 * com cap e jitter aleatório (±jitterMs).
 *
 * attempt=1 -> baseMs ± jitter
 * attempt=2 -> baseMs * factor ± jitter
 * attempt=N -> min(baseMs * factor^(N-1), capMs) ± jitter
 *
 * Garante valor >= 0.
 */
export function computeBackoffMs(
  attempt: number,
  opts: BackoffOptions = {},
  rand: () => number = Math.random
): number {
  const { baseMs, capMs, factor, jitterMs } = { ...DEFAULTS, ...opts };
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const exp = baseMs * Math.pow(factor, safeAttempt - 1);
  const capped = Math.min(exp, capMs);
  // jitter ∈ [-jitterMs, +jitterMs]
  const jitter = jitterMs > 0 ? Math.round((rand() * 2 - 1) * jitterMs) : 0;
  return Math.max(0, Math.round(capped + jitter));
}

// ── Agendamento por agente ───────────────────────────────────────
const pendingTimers = new Map<number, ReturnType<typeof setTimeout>>();

/**
 * Agenda uma tentativa de reconexão para `agentId` com `delayMs`.
 * Cancela qualquer tentativa anterior pendente para o mesmo agente.
 */
export function scheduleReconnect(
  agentId: number,
  delayMs: number,
  attempt: () => Promise<unknown>
): void {
  cancelReconnect(agentId);
  const timer = setTimeout(() => {
    pendingTimers.delete(agentId);
    Promise.resolve()
      .then(attempt)
      .catch((e) =>
        console.warn(
          `[baileys.reconnect] attempt failed for agent ${agentId}:`,
          (e as Error).message
        )
      );
  }, delayMs);
  pendingTimers.set(agentId, timer);
}

export function cancelReconnect(agentId: number): void {
  const t = pendingTimers.get(agentId);
  if (t) {
    clearTimeout(t);
    pendingTimers.delete(agentId);
  }
}

export function hasPendingReconnect(agentId: number): boolean {
  return pendingTimers.has(agentId);
}

/** Apenas para testes. */
export function _clearAllPendingForTest(): void {
  pendingTimers.forEach((t) => clearTimeout(t));
  pendingTimers.clear();
}

// ── Watchdog & Heartbeat ─────────────────────────────────────────
export type WatchdogContext = {
  /** Retorna true se o agente é considerado conectado (socket vivo). */
  isConnected: (agentId: number) => boolean;
  /** Lista agentes que deveriam estar conectados (do banco). */
  listAgents: () => Promise<Array<{ agentId: number }>>;
  /** Dispara reconexão para `agentId`. */
  startSession: (agentId: number) => Promise<void>;
  /** Última atividade conhecida (epoch ms) ou null. */
  getLastActivityAt: (agentId: number) => number | null;
  /** Envia heartbeat (presence) para o agente. */
  sendHeartbeat: (agentId: number) => Promise<void>;
};

let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Watchdog: a cada N ms, verifica agentes que deveriam estar conectados
 * mas não estão (socket caiu silenciosamente) e força reconnect.
 *
 * Também detecta sockets "zumbis": conectados há tempo mas sem nenhuma
 * atividade nos últimos `staleMs` — estes são considerados mortos e
 * derrubados para forçar nova tentativa.
 */
export function startWatchdog(
  ctx: WatchdogContext,
  opts: { intervalMs?: number; staleMs?: number } = {}
): void {
  const intervalMs = opts.intervalMs ?? 60_000;
  const staleMs = opts.staleMs ?? 5 * 60_000; // 5 min sem atividade = suspeito

  if (watchdogTimer) return; // idempotente

  const tick = async () => {
    try {
      const list = await ctx.listAgents();
      for (const { agentId } of list) {
        try {
          const live = ctx.isConnected(agentId);
          if (!live) {
            if (!hasPendingReconnect(agentId)) {
              console.log(
                `[baileys.watchdog] agent ${agentId} desconectado e sem reconnect pendente — religando`
              );
              await ctx.startSession(agentId);
            }
            continue;
          }
          // Está vivo: checa staleness
          const lastAt = ctx.getLastActivityAt(agentId);
          if (lastAt !== null && Date.now() - lastAt > staleMs) {
            console.warn(
              `[baileys.watchdog] agent ${agentId} sem atividade há ${
                Math.round((Date.now() - lastAt) / 1000)
              }s — sondando heartbeat`
            );
            // Heartbeat extra para validar — se falhar silenciosamente,
            // o connection.update fechará e vai reconectar via fluxo normal.
            await ctx.sendHeartbeat(agentId).catch(() => undefined);
          }
        } catch (e) {
          console.warn(
            `[baileys.watchdog] tick failed for agent ${agentId}:`,
            (e as Error).message
          );
        }
      }
    } catch (e) {
      console.warn("[baileys.watchdog] tick error:", (e as Error).message);
    }
  };

  watchdogTimer = setInterval(tick, intervalMs);
  console.log(
    `[baileys.watchdog] started (interval=${intervalMs}ms, stale=${staleMs}ms)`
  );
}

export function stopWatchdog(): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

/**
 * Heartbeat global: a cada N ms envia presence "available" em todas as
 * sessões conectadas para manter a conexão viva e detectar sockets mortos.
 */
export function startHeartbeat(
  ctx: Pick<WatchdogContext, "listAgents" | "isConnected" | "sendHeartbeat">,
  opts: { intervalMs?: number } = {}
): void {
  const intervalMs = opts.intervalMs ?? 30_000;
  if (heartbeatTimer) return;
  const tick = async () => {
    try {
      const list = await ctx.listAgents();
      for (const { agentId } of list) {
        if (!ctx.isConnected(agentId)) continue;
        await ctx.sendHeartbeat(agentId).catch(() => undefined);
      }
    } catch (e) {
      console.warn("[baileys.heartbeat] tick error:", (e as Error).message);
    }
  };
  heartbeatTimer = setInterval(tick, intervalMs);
  console.log(`[baileys.heartbeat] started (interval=${intervalMs}ms)`);
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

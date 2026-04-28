/**
 * Estatísticas de runtime do bridge Baileys, mantidas em memória.
 * Servem para o Dashboard expor saúde da sessão sem depender só de metrics_events
 * (que já cresce muito) e para o watchdog tomar decisões.
 *
 * Tudo aqui é por-agente. Reseta no boot do processo.
 */

export type AgentRuntimeStats = {
  agentId: number;
  // ── Conexão ──
  connectedSince: number | null; // epoch ms da última conexão "open"
  lastActivityAt: number | null; // epoch ms da última msg in/out
  reconnectAttempts: number; // contador da tentativa atual (zera ao conectar)
  totalReconnects: number; // total acumulado desde o boot
  lastReconnectAt: number | null;
  lastBackoffMs: number | null; // último delay aplicado
  // ── Mensagens ──
  inboundCount: number;
  outboundCount: number;
  outboundFailed: number;
  inboundLastMinute: number[]; // timestamps (epoch ms) dos últimos 60s
  outboundLastMinute: number[]; // timestamps (epoch ms) dos últimos 60s
  // ── Erros / health ──
  lastErrorAt: number | null;
  lastErrorMessage: string | null;
  rateLimitedCount: number; // quantas vezes o rate limiter atrasou um envio
};

const MAX_WINDOW_MS = 60_000;

const stats = new Map<number, AgentRuntimeStats>();

function ensure(agentId: number): AgentRuntimeStats {
  let s = stats.get(agentId);
  if (!s) {
    s = {
      agentId,
      connectedSince: null,
      lastActivityAt: null,
      reconnectAttempts: 0,
      totalReconnects: 0,
      lastReconnectAt: null,
      lastBackoffMs: null,
      inboundCount: 0,
      outboundCount: 0,
      outboundFailed: 0,
      inboundLastMinute: [],
      outboundLastMinute: [],
      lastErrorAt: null,
      lastErrorMessage: null,
      rateLimitedCount: 0,
    };
    stats.set(agentId, s);
  }
  return s;
}

function trimWindow(arr: number[], now: number): number[] {
  const cutoff = now - MAX_WINDOW_MS;
  // Remove timestamps mais antigos que a janela
  while (arr.length > 0 && arr[0] !== undefined && arr[0]! < cutoff) {
    arr.shift();
  }
  return arr;
}

export function markConnected(agentId: number): void {
  const s = ensure(agentId);
  s.connectedSince = Date.now();
  s.reconnectAttempts = 0;
  s.lastErrorAt = null;
  s.lastErrorMessage = null;
}

export function markDisconnected(agentId: number, errorMessage?: string | null): void {
  const s = ensure(agentId);
  s.connectedSince = null;
  if (errorMessage) {
    s.lastErrorAt = Date.now();
    s.lastErrorMessage = errorMessage;
  }
}

export function markReconnectAttempt(agentId: number, backoffMs: number): void {
  const s = ensure(agentId);
  s.reconnectAttempts += 1;
  s.totalReconnects += 1;
  s.lastReconnectAt = Date.now();
  s.lastBackoffMs = backoffMs;
}

export function markInbound(agentId: number): void {
  const s = ensure(agentId);
  const now = Date.now();
  s.inboundCount += 1;
  s.lastActivityAt = now;
  s.inboundLastMinute.push(now);
  trimWindow(s.inboundLastMinute, now);
}

export function markOutbound(agentId: number, ok: boolean): void {
  const s = ensure(agentId);
  const now = Date.now();
  if (ok) {
    s.outboundCount += 1;
    s.outboundLastMinute.push(now);
    trimWindow(s.outboundLastMinute, now);
  } else {
    s.outboundFailed += 1;
  }
  s.lastActivityAt = now;
}

export function markRateLimited(agentId: number): void {
  ensure(agentId).rateLimitedCount += 1;
}

/**
 * Snapshot serializável (com janelas já recalculadas para o "agora").
 */
export function getStatsSnapshot(agentId: number): {
  agentId: number;
  connectedSince: number | null;
  uptimeMs: number;
  lastActivityAt: number | null;
  reconnectAttempts: number;
  totalReconnects: number;
  lastReconnectAt: number | null;
  lastBackoffMs: number | null;
  inboundCount: number;
  outboundCount: number;
  outboundFailed: number;
  inboundPerMinute: number;
  outboundPerMinute: number;
  rateLimitedCount: number;
  lastErrorAt: number | null;
  lastErrorMessage: string | null;
} {
  const s = ensure(agentId);
  const now = Date.now();
  trimWindow(s.inboundLastMinute, now);
  trimWindow(s.outboundLastMinute, now);
  return {
    agentId,
    connectedSince: s.connectedSince,
    uptimeMs: s.connectedSince ? now - s.connectedSince : 0,
    lastActivityAt: s.lastActivityAt,
    reconnectAttempts: s.reconnectAttempts,
    totalReconnects: s.totalReconnects,
    lastReconnectAt: s.lastReconnectAt,
    lastBackoffMs: s.lastBackoffMs,
    inboundCount: s.inboundCount,
    outboundCount: s.outboundCount,
    outboundFailed: s.outboundFailed,
    inboundPerMinute: s.inboundLastMinute.length,
    outboundPerMinute: s.outboundLastMinute.length,
    rateLimitedCount: s.rateLimitedCount,
    lastErrorAt: s.lastErrorAt,
    lastErrorMessage: s.lastErrorMessage,
  };
}

/** Apenas para testes. */
export function _resetStatsForTest(): void {
  stats.clear();
}

/**
 * Rate limiter de envio por agente (token bucket).
 *
 * Evita ban por spam quando o agente tenta mandar rajadas grandes para
 * vários leads. Não REJEITA a mensagem: atrasa até o próximo token ficar
 * disponível (fila implícita pelo await).
 *
 * Também é útil quando o orchestrator gera múltiplas actions (split de
 * mensagens longas) + chamadas simultâneas de várias conversas.
 */

export type RateLimiterOptions = {
  /** Máximo de envios permitidos em `windowMs`. Default 20. */
  maxPerWindow?: number;
  /** Janela deslizante em ms. Default 60_000 (1 min). */
  windowMs?: number;
  /** Função de tempo (injetável para teste). Default Date.now. */
  now?: () => number;
  /** Função de espera (injetável para teste). Default setTimeout. */
  sleep?: (ms: number) => Promise<void>;
};

type Bucket = {
  // timestamps (ms) dos envios dentro da janela atual
  hits: number[];
};

const DEFAULTS = {
  maxPerWindow: 20,
  windowMs: 60_000,
};

const buckets = new Map<number, Bucket>();

function getBucket(agentId: number): Bucket {
  let b = buckets.get(agentId);
  if (!b) {
    b = { hits: [] };
    buckets.set(agentId, b);
  }
  return b;
}

function trim(b: Bucket, now: number, windowMs: number): void {
  const cutoff = now - windowMs;
  while (b.hits.length > 0 && b.hits[0]! < cutoff) b.hits.shift();
}

/**
 * Adquire 1 token para o agente. Se o bucket estiver cheio, aguarda até o
 * próximo slot liberar (dormindo `delayMs` calculado com base no hit mais
 * antigo da janela).
 *
 * Retorna `{ waitedMs }` informando quanto tempo ficou em espera (0 se passou
 * direto). O caller pode logar / instrumentar.
 */
export async function acquireToken(
  agentId: number,
  opts: RateLimiterOptions = {}
): Promise<{ waitedMs: number }> {
  const maxPerWindow = opts.maxPerWindow ?? DEFAULTS.maxPerWindow;
  const windowMs = opts.windowMs ?? DEFAULTS.windowMs;
  const now = opts.now ?? (() => Date.now());
  const sleep =
    opts.sleep ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const b = getBucket(agentId);
  let waited = 0;

  // Loop para lidar com o caso de múltiplas esperas consecutivas (raro, mas
  // robusto contra jitter do sleep).
  // Cap de 5 iterações para evitar loop infinito em edge-cases de mock de tempo.
  for (let i = 0; i < 5; i++) {
    const t = now();
    trim(b, t, windowMs);
    if (b.hits.length < maxPerWindow) {
      b.hits.push(t);
      return { waitedMs: waited };
    }
    // Bucket cheio: dorme até expirar o hit mais antigo
    const oldest = b.hits[0]!;
    const delayMs = Math.max(0, oldest + windowMs - t) + 25; // +25ms de folga
    waited += delayMs;
    await sleep(delayMs);
  }
  // Fallback defensivo: ainda adiciona o hit para não travar
  b.hits.push(now());
  return { waitedMs: waited };
}

/**
 * Quantos tokens foram usados dentro da janela atual.
 */
export function usedInWindow(
  agentId: number,
  opts: Pick<RateLimiterOptions, "windowMs" | "now"> = {}
): number {
  const windowMs = opts.windowMs ?? DEFAULTS.windowMs;
  const now = opts.now ?? (() => Date.now());
  const b = getBucket(agentId);
  trim(b, now(), windowMs);
  return b.hits.length;
}

/** Apenas para testes. */
export function _resetRateLimiterForTest(): void {
  buckets.clear();
}

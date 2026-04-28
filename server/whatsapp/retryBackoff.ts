/**
 * Backoff exponencial para reenvio de mensagens falhadas.
 *
 * Sequência (em segundos): 30, 120, 300, 900, 1800.
 * Após `maxAttempts`, a mensagem é marcada como `exhausted` e não tenta mais.
 *
 * Funções puras (sem I/O) — facilmente testáveis em vitest.
 */

export const DEFAULT_BACKOFF_SECONDS = [30, 120, 300, 900, 1800] as const;

/**
 * Calcula quando deve ser a próxima tentativa.
 * `attempt` é o número da tentativa que ACABOU de falhar (1, 2, 3, …).
 * Retorna o timestamp absoluto.
 */
export function nextRetryAt(
  attempt: number,
  now: Date = new Date(),
  schedule: readonly number[] = DEFAULT_BACKOFF_SECONDS
): Date {
  const idx = Math.max(0, Math.min(attempt - 1, schedule.length - 1));
  const delaySec = schedule[idx];
  return new Date(now.getTime() + delaySec * 1000);
}

/**
 * Verifica se ainda há tentativas restantes.
 */
export function hasMoreAttempts(attempt: number, maxAttempts: number): boolean {
  return attempt < maxAttempts;
}

/**
 * Sanitiza a mensagem de erro para não vazar segredos / payload muito longo.
 */
export function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 500);
}

/**
 * Fila FIFO por conversa para processamento de mensagens inbound.
 *
 * Garante que, para uma MESMA conversa, o handler de inbound é executado em
 * ordem estrita (uma por vez). Conversas diferentes processam em paralelo.
 *
 * Motivação: quando o lead manda rajada de 5 mensagens em 200ms, Baileys pode
 * entregar os eventos quase simultaneamente. Se `handleInbound` (async) roda
 * concorrentemente para a mesma conversa, aparecem races no
 * `setConversationPendingProcessAt` (janela fixa pode ser corrompida) e no
 * append/getConversationById (leitura desatualizada).
 *
 * Este módulo encadeia as tarefas via Promise, sem timers nem locks externos.
 */

type Task<T> = () => Promise<T>;

const queues = new Map<string, Promise<unknown>>();
const sizes = new Map<string, number>();

/**
 * Enfileira uma tarefa para a chave `key` (tipicamente "agentId:remoteJid" ou
 * "agentId:phone"). Retorna uma Promise que resolve com o resultado da task,
 * executada SOMENTE após todas as tasks anteriores da mesma chave terminarem.
 *
 * Erros lançados pela task são isolados — não contaminam a próxima.
 */
export function enqueue<T>(key: string, task: Task<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  sizes.set(key, (sizes.get(key) ?? 0) + 1);
  const next = prev
    // Esconde erros anteriores para não propagar pela cadeia inteira
    .catch(() => undefined)
    .then(async () => {
      try {
        return await task();
      } finally {
        const s = (sizes.get(key) ?? 1) - 1;
        if (s <= 0) {
          sizes.delete(key);
          // Só remove a cadeia quando realmente esvaziou (outra task pode ter entrado no meio)
          if (queues.get(key) === next) queues.delete(key);
        } else {
          sizes.set(key, s);
        }
      }
    });
  queues.set(key, next);
  return next;
}

/**
 * Quantas tasks pendentes para a chave (útil para métricas / testes).
 */
export function pendingCount(key: string): number {
  return sizes.get(key) ?? 0;
}

/** Total de chaves com fila ativa. */
export function activeKeysCount(): number {
  return queues.size;
}

/** Apenas para testes. */
export function _resetQueueForTest(): void {
  queues.clear();
  sizes.clear();
}

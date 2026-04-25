/**
 * Realtime bus — pub/sub em memória, escopado por conversationId.
 * Sem dependências externas. Pensado para ser barato, com auto‑limpeza
 * quando o último assinante de um canal sai.
 */

export type AgentTypingPhase =
  | "thinking"
  | "writing"
  | "delivering"
  | "idle";

export type RealtimeEvent =
  | {
      type: "message";
      conversationId: number;
      message: any;
    }
  | {
      type: "typing.agent";
      conversationId: number;
      phase: AgentTypingPhase;
      stepName?: string | null;
    }
  | {
      type: "status";
      conversationId: number;
      patch: Record<string, any>;
    };

type Subscriber = (event: RealtimeEvent) => void;

const channels = new Map<number, Set<Subscriber>>();

/** Registra um subscriber no canal e retorna a função para cancelar. */
export function subscribe(
  conversationId: number,
  fn: Subscriber
): () => void {
  let set = channels.get(conversationId);
  if (!set) {
    set = new Set();
    channels.set(conversationId, set);
  }
  set.add(fn);
  return () => {
    const s = channels.get(conversationId);
    if (!s) return;
    s.delete(fn);
    if (s.size === 0) channels.delete(conversationId);
  };
}

/** Publica um evento — falhas em subscribers individuais não derrubam o broadcast. */
export function publish(event: RealtimeEvent): void {
  const set = channels.get(event.conversationId);
  if (!set || set.size === 0) return;
  for (const fn of Array.from(set)) {
    try {
      fn(event);
    } catch {
      // ignora — um subscriber problemático não pode bloquear os outros
    }
  }
}

/** Quantidade de subscribers ativos em um canal — útil para testes/diagnóstico. */
export function subscriberCount(conversationId: number): number {
  return channels.get(conversationId)?.size ?? 0;
}

/** Limpa todos os canais — apenas para uso em testes. */
export function _resetForTests(): void {
  channels.clear();
}

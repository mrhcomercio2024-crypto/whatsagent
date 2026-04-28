/**
 * Realtime bus — pub/sub em memória, escopado por conversationId
 * + canal global por agente (para o painel "ao vivo").
 *
 * Sem dependências externas. Pensado para ser barato, com auto-limpeza
 * quando o último assinante de um canal sai.
 */

export type AgentTypingPhase =
  | "thinking"
  | "writing"
  | "delivering"
  | "idle";

export type LeadTypingPhase = "composing" | "recording" | "paused" | "idle";

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
      type: "typing.lead";
      conversationId: number;
      phase: LeadTypingPhase;
    }
  | {
      type: "status";
      conversationId: number;
      patch: Record<string, any>;
    };

type Subscriber = (event: RealtimeEvent) => void;

const channels = new Map<number, Set<Subscriber>>();

/** Subscribers globais por agentId (usado pelo painel "ao vivo"). */
const agentChannels = new Map<number, Set<Subscriber>>();

/**
 * Map de conversationId -> agentId, alimentado em todo publish que conhece o
 * agente (via campo `agentId` opcional do evento). Garante que o broadcast
 * global por agente continue funcionando mesmo quando o publisher só conhece
 * a conversation. Para eventos crus, o caller pode informar `agentId` direto.
 */
const conversationAgentMap = new Map<number, number>();

/** Registra que `conversationId` pertence a `agentId`. Idempotente. */
export function bindConversationToAgent(
  conversationId: number,
  agentId: number
): void {
  conversationAgentMap.set(conversationId, agentId);
}

/** Registra um subscriber no canal de uma conversa. */
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

/** Registra um subscriber no canal global de um agente. */
export function subscribeAgent(
  agentId: number,
  fn: Subscriber
): () => void {
  let set = agentChannels.get(agentId);
  if (!set) {
    set = new Set();
    agentChannels.set(agentId, set);
  }
  set.add(fn);
  return () => {
    const s = agentChannels.get(agentId);
    if (!s) return;
    s.delete(fn);
    if (s.size === 0) agentChannels.delete(agentId);
  };
}

/**
 * Publica um evento. Se um `agentId` for passado, o evento é roteado também
 * para o canal global do agente. Se não for passado mas o conversationId já
 * estiver vinculado a um agente, o roteamento é feito automaticamente.
 */
export function publish(event: RealtimeEvent, agentId?: number): void {
  const set = channels.get(event.conversationId);
  if (set && set.size > 0) {
    for (const fn of Array.from(set)) {
      try {
        fn(event);
      } catch {
        // um subscriber problemático não pode bloquear os outros
      }
    }
  }

  const aid = agentId ?? conversationAgentMap.get(event.conversationId);
  if (aid !== undefined) {
    const aSet = agentChannels.get(aid);
    if (aSet && aSet.size > 0) {
      for (const fn of Array.from(aSet)) {
        try {
          fn(event);
        } catch {
          // idem
        }
      }
    }
  }
}

/** Quantidade de subscribers ativos em um canal. */
export function subscriberCount(conversationId: number): number {
  return channels.get(conversationId)?.size ?? 0;
}

/** Quantidade de subscribers ativos no canal global de um agente. */
export function agentSubscriberCount(agentId: number): number {
  return agentChannels.get(agentId)?.size ?? 0;
}

/** Limpa todos os canais — apenas para uso em testes. */
export function _resetForTests(): void {
  channels.clear();
  agentChannels.clear();
  conversationAgentMap.clear();
}

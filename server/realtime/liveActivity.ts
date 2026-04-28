/**
 * Agregador de "atividade ao vivo" por agente.
 *
 * Mantém em memória, por agente, um snapshot das conversas que tiveram
 * qualquer evento (mensagem ou typing) recentemente. É alimentado pelo
 * `bus.publish` via `subscribeAgent` e exposto através de `getActiveSnapshot`
 * (usado pelo procedure tRPC `live.listActive`).
 *
 * É puramente in-memory: no boot tudo começa vazio. Isso é proposital — o
 * propósito da página `/live` é só mostrar o que está acontecendo AGORA.
 */

import {
  subscribeAgent,
  type RealtimeEvent,
  type AgentTypingPhase,
  type LeadTypingPhase,
} from "./bus";

export type ActiveConversation = {
  conversationId: number;
  agentId: number;
  lastEventAt: number; // unix ms
  lastMessageAt: number | null; // unix ms (apenas mensagens)
  lastMessageText: string | null;
  lastMessageDirection: "inbound" | "outbound" | null;
  agentTyping: AgentTypingPhase; // "idle" se nada
  leadTyping: LeadTypingPhase; // "idle" se nada
  agentTypingExpiresAt: number; // unix ms — auto-volta pra idle quando vencer
  leadTypingExpiresAt: number; // idem
};

const TYPING_TTL_MS = 8_000; // se nada chegar em 8s, presume "idle"
const PRUNE_AFTER_MS = 5 * 60_000; // remove conversa do snapshot após 5min sem evento

const byAgent = new Map<number, Map<number, ActiveConversation>>();
const subscriptions = new Map<number, () => void>();

function getOrCreateAgentMap(agentId: number): Map<number, ActiveConversation> {
  let m = byAgent.get(agentId);
  if (!m) {
    m = new Map();
    byAgent.set(agentId, m);
  }
  return m;
}

function ensureSubscribed(agentId: number): void {
  if (subscriptions.has(agentId)) return;
  const off = subscribeAgent(agentId, (evt) => handleEvent(agentId, evt));
  subscriptions.set(agentId, off);
}

function getOrCreateConv(
  agentMap: Map<number, ActiveConversation>,
  agentId: number,
  conversationId: number,
  now: number
): ActiveConversation {
  let c = agentMap.get(conversationId);
  if (!c) {
    c = {
      conversationId,
      agentId,
      lastEventAt: now,
      lastMessageAt: null,
      lastMessageText: null,
      lastMessageDirection: null,
      agentTyping: "idle",
      leadTyping: "idle",
      agentTypingExpiresAt: 0,
      leadTypingExpiresAt: 0,
    };
    agentMap.set(conversationId, c);
  }
  return c;
}

function extractMessageInfo(message: any): {
  text: string;
  direction: "inbound" | "outbound" | null;
} {
  if (!message || typeof message !== "object") {
    return { text: "", direction: null };
  }
  const direction =
    message.direction === "inbound" || message.direction === "outbound"
      ? (message.direction as "inbound" | "outbound")
      : null;
  let text = "";
  if (typeof message.text === "string") text = message.text;
  else if (typeof message.content === "string") text = message.content;
  else if (message.payload && typeof message.payload === "object") {
    if (typeof message.payload.text === "string") text = message.payload.text;
  }
  if (!text) {
    if (message.mediaType) text = `[${message.mediaType}]`;
    else if (message.kind === "media") text = "[mídia]";
  }
  return { text: text.slice(0, 240), direction };
}

function handleEvent(agentId: number, evt: RealtimeEvent): void {
  const now = Date.now();
  const agentMap = getOrCreateAgentMap(agentId);
  const conv = getOrCreateConv(agentMap, agentId, evt.conversationId, now);
  conv.lastEventAt = now;

  if (evt.type === "message") {
    const info = extractMessageInfo((evt as any).message);
    conv.lastMessageAt = now;
    if (info.text) conv.lastMessageText = info.text;
    if (info.direction) conv.lastMessageDirection = info.direction;
    // Quem mandou mensagem parou de digitar
    if (info.direction === "inbound") {
      conv.leadTyping = "idle";
      conv.leadTypingExpiresAt = 0;
    } else if (info.direction === "outbound") {
      conv.agentTyping = "idle";
      conv.agentTypingExpiresAt = 0;
    }
  } else if (evt.type === "typing.agent") {
    conv.agentTyping = evt.phase;
    conv.agentTypingExpiresAt =
      evt.phase === "idle" ? 0 : now + TYPING_TTL_MS;
  } else if (evt.type === "typing.lead") {
    conv.leadTyping = evt.phase;
    conv.leadTypingExpiresAt =
      evt.phase === "idle" ? 0 : now + TYPING_TTL_MS;
  } else if (evt.type === "status") {
    // status não muda typing nem mensagem — só refresh do timestamp
  }
}

/**
 * Garante que o agregador está ouvindo o agente e devolve o snapshot atual,
 * já com TTL de typing aplicado e ordenação por última atividade desc.
 */
export function getActiveSnapshot(agentId: number): ActiveConversation[] {
  ensureSubscribed(agentId);
  const m = byAgent.get(agentId);
  if (!m) return [];
  const now = Date.now();
  const out: ActiveConversation[] = [];
  for (const conv of Array.from(m.values())) {
    if (now - conv.lastEventAt > PRUNE_AFTER_MS) {
      m.delete(conv.conversationId);
      continue;
    }
    // Aplica TTL de typing
    const cleaned: ActiveConversation = {
      ...conv,
      agentTyping:
        conv.agentTyping !== "idle" && conv.agentTypingExpiresAt < now
          ? "idle"
          : conv.agentTyping,
      leadTyping:
        conv.leadTyping !== "idle" && conv.leadTypingExpiresAt < now
          ? "idle"
          : conv.leadTyping,
    };
    out.push(cleaned);
  }
  out.sort((a, b) => b.lastEventAt - a.lastEventAt);
  return out;
}

/** Devolve só o número de conversas ativas (já com prune aplicado). */
export function countActive(agentId: number): number {
  return getActiveSnapshot(agentId).length;
}

/** Conta quantas conversas têm o agente ou o lead digitando agora. */
export function countTyping(agentId: number): {
  agent: number;
  lead: number;
} {
  const snap = getActiveSnapshot(agentId);
  let agent = 0;
  let lead = 0;
  for (const c of snap) {
    if (c.agentTyping !== "idle") agent++;
    if (c.leadTyping !== "idle") lead++;
  }
  return { agent, lead };
}

/** Limpa tudo — uso em testes. */
export function _resetForTests(): void {
  for (const off of Array.from(subscriptions.values())) off();
  subscriptions.clear();
  byAgent.clear();
}

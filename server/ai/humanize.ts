/**
 * Camadas de "humanização":
 *  1. Debounce de processamento — agenda o turno em pendingProcessAt
 *     e processa só quando o lead pára de mandar mensagens.
 *  2. Indicador de "digitando..." e atrasos proporcionais ao tamanho
 *     da mensagem antes de cada envio.
 *
 * Compatível com os dois transportes (API Oficial e Baileys),
 * pois delega o envio do typing para um callback opcional.
 */
import type { Agent } from "../../drizzle/schema";

export type TypingCallback = (state: "on" | "off") => Promise<void>;

/** Sleep utilitário que respeita AbortSignal opcional. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("aborted"));
    const t = setTimeout(() => {
      resolve();
      signal?.removeEventListener("abort", onAbort);
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort);
  });
}

/**
 * Calcula quanto tempo "digitar" uma mensagem, dado:
 *  - tamanho do texto (caracteres)
 *  - velocidade configurada (caracteres por segundo)
 *  - limites min/max (ms)
 */
export function computeTypingDelayMs(
  textLength: number,
  agent: Pick<Agent, "typingCps" | "typingMinDelayMs" | "typingMaxDelayMs">
): number {
  const cps = Math.max(1, agent.typingCps);
  const raw = Math.round((textLength / cps) * 1000);
  const min = Math.max(0, agent.typingMinDelayMs);
  const max = Math.max(min, agent.typingMaxDelayMs);
  return Math.min(max, Math.max(min, raw));
}

/**
 * Executa a sequência:
 *   typing on → wait(delay) → typing off
 * antes do envio real. Usado por dispatcher antes de cada mensagem.
 */
export async function simulateTypingForMessage(opts: {
  agent: Agent;
  textLength: number;
  setTyping?: TypingCallback;
  signal?: AbortSignal;
}): Promise<void> {
  const { agent, textLength, setTyping, signal } = opts;
  if (!agent.typingSimulationEnabled) return;
  const delay = computeTypingDelayMs(textLength, agent);
  if (setTyping) {
    try {
      await setTyping("on");
    } catch {
      /* ignora */
    }
  }
  try {
    await sleep(delay, signal);
  } finally {
    if (setTyping) {
      try {
        await setTyping("off");
      } catch {
        /* ignora */
      }
    }
  }
}

/** Pausa entre mensagens consecutivas do bot. */
export async function pauseBetweenMessages(
  agent: Pick<Agent, "interMessageDelayMs">,
  signal?: AbortSignal
): Promise<void> {
  if (agent.interMessageDelayMs > 0) {
    await sleep(agent.interMessageDelayMs, signal);
  }
}

/** Retorna o timestamp em que a conversa deve ser processada (debounce). */
export function nextProcessAt(
  agent: Pick<Agent, "debounceSeconds">,
  now: Date = new Date()
): Date {
  const sec = Math.max(0, agent.debounceSeconds);
  return new Date(now.getTime() + sec * 1000);
}

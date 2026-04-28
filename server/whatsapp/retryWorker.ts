/**
 * Retry Worker — reenvia mensagens que falharam.
 *
 * Tica a cada 10s, pega até 25 retries `pending` com `nextRetryAt <= now`,
 * e tenta reenviar via `dispatchActions` (mesmo caminho do envio normal).
 *
 * Cancelamento automático:
 *  - Se a conversation está `aiPaused`, `human_handoff` ou `closed` → cancelled.
 *  - Se chegou inbound novo do lead depois do `createdAt` do retry →
 *    cancelled_by_reply (handleInbound também cancela ao chegar mensagem).
 *
 * Sucesso → `succeeded`. Falha mas ainda há tentativas → reagenda com backoff.
 * Falha + sem tentativas → `exhausted` + log.
 */

import {
  listDueMessageRetries,
  updateMessageRetry,
  getConversationById,
  getAgentById,
  listMessages,
} from "../db";
import { dispatchActions } from "./dispatcher";
import {
  hasMoreAttempts,
  nextRetryAt,
  sanitizeError,
} from "./retryBackoff";

let timer: NodeJS.Timeout | null = null;
let running = false;

const TICK_INTERVAL_MS = 10_000;

export function startRetryWorker() {
  if (timer) return;
  console.log(`[retry-worker] started (interval=${TICK_INTERVAL_MS}ms)`);
  timer = setInterval(() => {
    void tick();
  }, TICK_INTERVAL_MS);
  // Roda um tick imediatamente também
  void tick();
}

/**
 * Dispara um tick imediato (fora do intervalo regular).
 * Usado quando uma conexão WhatsApp acaba de voltar (markConnected) para
 * reentregar a fila de mensagens pendentes do agente sem esperar 10s.
 *
 * Idempotente: se já há um tick rodando, o `running` flag interno
 * faz o segundo no-op.
 */
export function runRetryWorkerNow(reason?: string) {
  if (reason) console.log(`[retry-worker] runNow triggered: ${reason}`);
  void tick();
}

export function stopRetryWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log(`[retry-worker] stopped`);
  }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const due = await listDueMessageRetries(new Date(), 25);
    if (due.length === 0) return;
    console.log(`[retry-worker] picked up ${due.length} due retry/retries`);
    await Promise.all(due.map(processOne));
  } catch (e) {
    console.error("[retry-worker] tick failed:", (e as Error).message);
  } finally {
    running = false;
  }
}

async function processOne(retry: any) {
  try {
    // 1) Verificar se a conversa ainda está apta a receber
    const conv = await getConversationById(retry.conversationId);
    if (!conv) {
      await updateMessageRetry(retry.id, {
        status: "cancelled",
        lastError: "conversation not found",
        completedAt: new Date(),
      });
      return;
    }
    if (conv.aiPaused || conv.status === "human_handoff" || conv.status === "closed") {
      await updateMessageRetry(retry.id, {
        status: "cancelled",
        lastError: `conversation status=${conv.status} aiPaused=${conv.aiPaused}`,
        completedAt: new Date(),
      });
      return;
    }

    // 2) Cancelar se o lead respondeu depois do retry ser criado
    const recentMsgs = await listMessages(retry.conversationId, { limit: 20 });
    const replyAfter = recentMsgs.find(
      m =>
        m.sender === "lead" &&
        m.createdAt &&
        new Date(m.createdAt).getTime() > new Date(retry.createdAt).getTime()
    );
    if (replyAfter) {
      await updateMessageRetry(retry.id, {
        status: "cancelled_by_reply",
        lastError: "lead replied after retry was scheduled",
        completedAt: new Date(),
      });
      console.log(
        `[retry-worker] retry ${retry.id} cancelled (lead replied at ${replyAfter.createdAt})`
      );
      return;
    }

    // 3) Carregar agente e disparar
    const agent = await getAgentById(retry.agentId);
    if (!agent) {
      await updateMessageRetry(retry.id, {
        status: "cancelled",
        lastError: "agent not found",
        completedAt: new Date(),
      });
      return;
    }

    const payload = retry.payload as any;
    const action =
      payload?.type === "media"
        ? { type: "media" as const, mediaId: payload.mediaId }
        : { type: "text" as const, text: payload?.text ?? "" };

    const newAttempt = retry.attempt + 1;
    console.log(
      `[retry-worker] retrying msg conv=${retry.conversationId} attempt=${newAttempt}/${retry.maxAttempts}`
    );

    let success = false;
    let errorMsg: string | null = null;
    try {
      // dispatchActions já loga e marca métricas. Se falhar de novo, vai
      // chamar enqueueMessageRetry de novo, mas como passamos `_isRetryRun`
      // via payload.__retry, ele NÃO vai re-enfileirar — só atualiza este
      // mesmo registro com o próximo nextRetryAt.
      await dispatchActions({
        agent,
        conversationId: retry.conversationId,
        actions: [action],
        sender: retry.sender ?? "ai",
        // @ts-expect-error - flag interna usada por baileys.ts pra evitar loop
        __isRetry: { retryId: retry.id },
      });
      success = true;
    } catch (e) {
      errorMsg = sanitizeError(e);
    }

    if (success) {
      // O dispatch foi até o fim — mas o sock pode ter falhado em silêncio.
      // Para simplificar a primeira versão, marcamos como succeeded aqui.
      // Cenários de "falha silenciosa" (sock retorna mas msg não chega) ficam
      // para uma camada de ack-receipts futura.
      await updateMessageRetry(retry.id, {
        attempt: newAttempt,
        status: "succeeded",
        completedAt: new Date(),
      });
      console.log(`[retry-worker] retry ${retry.id} succeeded`);
      return;
    }

    // Falhou — decidir se reagenda ou esgota
    if (hasMoreAttempts(newAttempt, retry.maxAttempts)) {
      const next = nextRetryAt(newAttempt);
      await updateMessageRetry(retry.id, {
        attempt: newAttempt,
        nextRetryAt: next,
        lastError: errorMsg,
      });
      console.log(
        `[retry-worker] retry ${retry.id} failed, rescheduled for ${next.toISOString()}`
      );
    } else {
      await updateMessageRetry(retry.id, {
        attempt: newAttempt,
        status: "exhausted",
        lastError: errorMsg,
        completedAt: new Date(),
      });
      console.warn(
        `[retry-worker] retry ${retry.id} exhausted after ${newAttempt} attempts: ${errorMsg}`
      );
    }
  } catch (e) {
    console.error(`[retry-worker] processOne ${retry.id} failed:`, (e as Error).message);
  }
}

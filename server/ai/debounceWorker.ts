/**
 * Worker que tica a cada 1s, varre conversations.pendingProcessAt
 * vencido, e dispara o processamento da IA — agora com todas as
 * mensagens recentes do lead coalesced em um único turno.
 */
import {
  concatRecentInbound,
  getAgentById,
  getConversationById,
  listConversationsDueForProcessing,
  setConversationPendingProcessAt,
} from "../db";
import { processInboundForReply } from "./orchestrator";
import { dispatchActions } from "../whatsapp/dispatcher";

let started = false;
let handle: NodeJS.Timeout | null = null;

export function startDebounceWorker() {
  if (started) return;
  started = true;
  const tick = async () => {
    try {
      await processDueConversations();
    } catch (e) {
      console.error("[debounce] tick error:", e);
    }
  };
  handle = setInterval(tick, 1000);
  setTimeout(tick, 2000);
  console.log("[debounce] worker started");
}

export function stopDebounceWorker() {
  if (handle) clearInterval(handle);
  handle = null;
  started = false;
}

async function processDueConversations() {
  const now = new Date();
  const due = await listConversationsDueForProcessing(now, 25);
  if (due.length > 0) {
    console.log(`[debounce] picked up ${due.length} due conversation(s)`);
  }
  for (const conv of due) {
    // Limpa o pending logo de cara para evitar processamento duplicado.
    await setConversationPendingProcessAt(conv.id, null);
    try {
      if (conv.aiPaused || conv.status === "human_handoff" || conv.status === "closed") {
        console.log(
          `[debounce] conv ${conv.id} skipped (aiPaused=${conv.aiPaused}, status=${conv.status})`
        );
        continue;
      }
      const agent = await getAgentById(conv.agentId);
      if (!agent) {
        console.warn(`[debounce] conv ${conv.id} agent not found`);
        continue;
      }
      const inboundText = await concatRecentInbound(conv.id, 5 * 60_000);
      if (!inboundText) {
        console.log(`[debounce] conv ${conv.id} no recent inbound text`);
        continue;
      }

      const fresh = await getConversationById(conv.id);
      if (!fresh) continue;

      console.log(
        `[debounce] processing conv ${conv.id} agent=${agent.id} text="${inboundText.slice(0, 80)}"`
      );
      const result = await processInboundForReply({
        agent,
        conversationId: conv.id,
        inboundText,
      });
      console.log(
        `[debounce] conv ${conv.id} result: actions=${result.actions.length} handoff=${result.handoff} outOfHours=${result.outOfHours}`
      );
      if (result.actions.length > 0) {
        await dispatchActions({
          agent,
          conversationId: conv.id,
          actions: result.actions,
          sender: "ai",
        });
        console.log(
          `[debounce] conv ${conv.id} dispatched ${result.actions.length} action(s)`
        );
      }
    } catch (e) {
      console.error(`[debounce] failed conv ${conv.id}:`, e);
    }
  }
}

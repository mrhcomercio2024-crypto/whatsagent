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
  for (const conv of due) {
    // Limpa o pending logo de cara para evitar processamento duplicado.
    await setConversationPendingProcessAt(conv.id, null);
    try {
      if (conv.aiPaused || conv.status === "human_handoff" || conv.status === "closed") {
        continue;
      }
      const agent = await getAgentById(conv.agentId);
      if (!agent) continue;
      const inboundText = await concatRecentInbound(conv.id, 5 * 60_000);
      if (!inboundText) continue;

      const fresh = await getConversationById(conv.id);
      if (!fresh) continue;

      const result = await processInboundForReply({
        agent,
        conversationId: conv.id,
        inboundText,
      });
      if (result.actions.length > 0) {
        await dispatchActions({
          agent,
          conversationId: conv.id,
          actions: result.actions,
          sender: "ai",
        });
      }
    } catch (e) {
      console.error(`[debounce] failed conv ${conv.id}:`, e);
    }
  }
}

/**
 * Worker que tica a cada 1s, varre conversations.pendingProcessAt
 * vencido, e dispara o processamento da IA — agora com todas as
 * mensagens recentes do lead coalesced em um único turno.
 */
import {
  claimConversationForProcessing,
  concatRecentInbound,
  getAgentById,
  getConversationById,
  listConversationsDueForProcessing,
  purgeStalePendingProcess,
} from "../db";
import { processInboundForReply } from "./orchestrator";
import { dispatchActions } from "../whatsapp/dispatcher";

let started = false;
let handle: NodeJS.Timeout | null = null;

/**
 * [Fase 91] Janela de tolerância: agendamentos vencidos há menos
 * de `BOOT_PURGE_GRACE_MS` continuam válidos (debounce normal,
 * de 5–30s, conta como "recente"). Vencidos há mais que isso são
 * descartados no boot — considerados legítimos só se o servidor
 * estivesse de pé, mas como não estava, a IA NÃO deve responder.
 */
const BOOT_PURGE_GRACE_MS = 60_000; // 60s

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
  // [Fase 91] Antes de começar a ticar, purga agendamentos antigos.
  // Cobre o caso de o servidor ter reiniciado enquanto havia conversas
  // com pendingProcessAt agendado — sem essa purga, o primeiro tick
  // dispararia respostas "em rajada" para todos os leads acumulados.
  void (async () => {
    try {
      const cutoff = new Date(Date.now() - BOOT_PURGE_GRACE_MS);
      const purged = await purgeStalePendingProcess(cutoff);
      if (purged > 0) {
        console.log(
          `[debounce] boot purge: descartou ${purged} pendingProcessAt antigo(s) (mensagens recebidas antes do restart não serão respondidas)`
        );
      }
    } catch (e) {
      console.warn("[debounce] boot purge falhou:", (e as Error).message);
    }
  })();
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
  // Processa em paralelo: cada conv é independente; LLM + dispatch lentos
  // não devem segurar o tick. Hard-cap defensivo de 90s por conv para
  // garantir que nenhum job ocupe o slot por mais de um minuto e meio.
  await Promise.all(due.map(conv => processOneWithTimeout(conv, 90_000)));
}

async function processOneWithTimeout(conv: any, timeoutMs: number) {
  let timer: NodeJS.Timeout | null = null;
  try {
    await Promise.race([
      processOne(conv),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`debounce timeout (${timeoutMs}ms)`)),
          timeoutMs
        );
      }),
    ]);
  } catch (e) {
    console.error(`[debounce] failed conv ${conv.id}:`, (e as Error).message);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function processOne(conv: any) {
  // Lock atômico: só prossegue se ESTE worker conseguiu zerar o pendingProcessAt.
  // Outro tick paralelo que pegou a mesma row no SELECT vai falhar aqui (affectedRows=0)
  // — assim garantimos UMA única execução do orchestrator por turno.
  const claimed = await claimConversationForProcessing(conv.id, new Date());
  if (!claimed) {
    console.log(`[debounce] conv ${conv.id} skipped (lock já obtido por outro worker)`);
    return;
  }
  if (conv.aiPaused || conv.status === "human_handoff" || conv.status === "closed") {
    console.log(
      `[debounce] conv ${conv.id} skipped (aiPaused=${conv.aiPaused}, status=${conv.status})`
    );
    return;
  }
  const agent = await getAgentById(conv.agentId);
  if (!agent) {
    console.warn(`[debounce] conv ${conv.id} agent not found`);
    return;
  }
  const inboundText = await concatRecentInbound(conv.id, 5 * 60_000);
  if (!inboundText) {
    console.log(`[debounce] conv ${conv.id} no recent inbound text`);
    return;
  }

  const fresh = await getConversationById(conv.id);
  if (!fresh) return;

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
}

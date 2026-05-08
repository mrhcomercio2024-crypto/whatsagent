/**
 * Webhook Z-API.
 *
 * URL pública configurada no painel Z-API → "Ao receber":
 *   POST /api/zapi/:agentId/inbound?secret=<webhookSecret>
 *
 * O `agentId` na URL identifica unicamente a instância;
 * o `secret` (query string) protege contra chamadas indevidas.
 *
 * Z-API NÃO envia HMAC. Para autenticar usamos o secret embutido na URL.
 */
import type { Express, Request, Response } from "express";
import {
  appendMessage,
  findOrCreateConversation,
  findOrCreateLead,
  getAgentByZapiInstanceId,
  getConversationById,
  getZapiInstance,
  inboundMessageExists,
  recordMetric,
  setConversationPendingProcessAt,
  upsertZapiInstance,
} from "../db";
import { extractInboundContent, verifyWebhookSecret, type ZapiInboundWebhook } from "./zapi";
import { nextProcessAt } from "../ai/humanize";

export function registerZapiWebhook(app: Express) {
  app.post("/api/zapi/:agentId/inbound", async (req: Request, res: Response) => {
    res.status(200).json({ ok: true });
    try {
      await handleZapiIncoming(req);
    } catch (err) {
      console.error("[zapi-webhook] error:", err);
    }
  });

  // Endpoint dedicado opcional para "Ao desconectar" / "Ao conectar"
  app.post("/api/zapi/:agentId/status", async (req: Request, res: Response) => {
    res.status(200).json({ ok: true });
    try {
      await handleZapiStatus(req);
    } catch (err) {
      console.error("[zapi-webhook] status error:", err);
    }
  });
}

async function handleZapiIncoming(req: Request) {
  const agentIdNum = Number(req.params.agentId);
  if (!Number.isFinite(agentIdNum)) return;
  const inst = await getZapiInstance(agentIdNum);
  if (!inst) {
    console.warn(`[zapi-webhook] no instance for agent ${agentIdNum}`);
    return;
  }
  const got = req.query.secret;
  if (!verifyWebhookSecret(inst.webhookSecret, Array.isArray(got) ? got[0] as string : got as string | undefined)) {
    console.warn(`[zapi-webhook] invalid secret for agent ${agentIdNum}`);
    return;
  }
  const payload = (req.body || {}) as ZapiInboundWebhook;
  if (!payload.phone) return;

  // Cross-check: se Z-API mandou instanceId, confirmar que bate
  if (payload.instanceId && payload.instanceId !== inst.instanceId) {
    const matchAgent = await getAgentByZapiInstanceId(payload.instanceId);
    if (matchAgent && matchAgent.id !== agentIdNum) {
      console.warn(
        `[zapi-webhook] instance mismatch: url-agent=${agentIdNum} payload-instance=${payload.instanceId}`
      );
      return;
    }
  }

  const content = extractInboundContent(payload);
  if (!content) return;

  const leadId = await findOrCreateLead(agentIdNum, payload.phone, payload.senderName ?? undefined);
  const convId = await findOrCreateConversation(agentIdNum, leadId);

  // Idempotência: Z-API às vezes retransmite o mesmo webhook (timeouts/retries do painel deles).
  // Se já temos uma mensagem com este waMessageId, ignoramos para não duplicar.
  if (payload.messageId) {
    const exists = await inboundMessageExists(convId, payload.messageId);
    if (exists) {
      console.log(
        `[zapi-webhook] duplicate inbound ignorado conv=${convId} waMessageId=${payload.messageId}`
      );
      return;
    }
  }

  await appendMessage({
    conversationId: convId,
    direction: "inbound",
    sender: "lead",
    contentType: (content.mediaType as any) || "text",
    body: content.text,
    mediaUrl: content.mediaUrl ?? null,
    waMessageId: payload.messageId ?? null,
    metadata: {
      from: payload.phone,
      provider: "zapi",
      mimeType: content.mimeType,
      fileName: content.fileName,
    },
  });

  await recordMetric({
    agentId: agentIdNum,
    conversationId: convId,
    eventType: "message_received",
  });

  const conv = await getConversationById(convId);
  if (!conv) return;
  if (conv.aiPaused || conv.status === "human_handoff") return;

  try {
    // Importar Agent dinamicamente para descobrir debounceSeconds
    const { getAgentById } = await import("../db");
    const agent = await getAgentById(agentIdNum);
    if (agent) {
      const eta = nextProcessAt(agent);
      await setConversationPendingProcessAt(convId, eta);
      try {
        const { publish, bindConversationToAgent } = await import("../realtime/bus");
        bindConversationToAgent(convId, agentIdNum);
        publish(
          {
            type: "pipeline",
            conversationId: convId,
            phase: "scheduled",
            etaAt: eta.getTime(),
            label: `IA começa a digitar em ${Math.max(0, agent.debounceSeconds)}s`,
          },
          agentIdNum
        );
      } catch {
        // realtime falho não pode quebrar o webhook
      }
    }
  } catch (err) {
    console.error("[zapi-webhook] schedule debounce failed:", err);
  }
}

async function handleZapiStatus(req: Request) {
  const agentIdNum = Number(req.params.agentId);
  if (!Number.isFinite(agentIdNum)) return;
  const inst = await getZapiInstance(agentIdNum);
  if (!inst) return;
  const got = req.query.secret;
  if (!verifyWebhookSecret(inst.webhookSecret, Array.isArray(got) ? got[0] as string : got as string | undefined)) return;
  const body = (req.body || {}) as { connected?: boolean; phoneConnected?: string; type?: string };
  const isConnected =
    typeof body.connected === "boolean"
      ? body.connected
      : body.type === "ConnectedCallback" || body.type === "Connected"
      ? true
      : body.type === "DisconnectedCallback" || body.type === "Disconnected"
      ? false
      : inst.isConnected;
  await upsertZapiInstance(agentIdNum, {
    isConnected,
    connectedPhone: body.phoneConnected ?? inst.connectedPhone,
    lastStatusCheckAt: new Date(),
  });

  // [Fase 91] Quando a instância Z-API VOLTA do offline (transição
  // disconnected -> connected), descartamos qualquer `pendingProcessAt`
  // antigo das conversas. Sem isso, o debounce worker dispara respostas
  // automaticamente para todos os leads que escreveram durante a queda.
  const wasOffline = !inst.isConnected;
  if (isConnected && wasOffline) {
    try {
      const { purgePendingProcessForAgent } = await import("../db");
      const purged = await purgePendingProcessForAgent(agentIdNum, new Date());
      if (purged > 0) {
        console.log(
          `[zapi-webhook] agent ${agentIdNum} reconectou — purgou ${purged} pendingProcessAt antigo(s) (mensagens recebidas durante offline não serão respondidas automaticamente)`
        );
      }
    } catch (e) {
      console.warn(
        `[zapi-webhook] purgePendingProcessForAgent falhou para agent ${agentIdNum}: ${(e as Error).message}`
      );
    }
  }
}

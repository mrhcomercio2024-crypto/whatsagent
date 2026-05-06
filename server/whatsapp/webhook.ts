/**
 * Webhook da Meta WhatsApp Cloud API.
 *
 * GET  /api/whatsapp/webhook  → verificação inicial (hub.challenge)
 * POST /api/whatsapp/webhook  → eventos (mensagens, status)
 *
 * O usuário cadastra o `verifyToken` por agente em `whatsapp_config`.
 * Como uma única URL atende todos os agentes, aceitamos a verificação
 * se ALGUM agente tiver esse verifyToken cadastrado.
 */
import type { Express, Request, Response } from "express";
import {
  appendMessage,
  findOrCreateConversation,
  findOrCreateLead,
  getAgentByPhoneNumberId,
  getConversationById,
  getDb,
  getWhatsappConfig,
  recordMetric,
  updateConversation,
} from "../db";
import { whatsappConfig } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { processInboundForReply } from "../ai/orchestrator";
import { dispatchActions } from "./dispatcher";
import { downloadMedia, verifyWebhookSignature } from "./client";
import { recognizeMedia, absoluteStorageUrl } from "../ai/mediaRecognition";

export function registerWhatsappWebhook(app: Express) {
  // Capture raw body para verificação de assinatura (HMAC)
  app.use("/api/whatsapp/webhook", (req, _res, next) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", chunk => (data += chunk));
    req.on("end", () => {
      (req as any).rawBody = data;
      try {
        (req as any).body = data ? JSON.parse(data) : {};
      } catch {
        (req as any).body = {};
      }
      next();
    });
  });

  // Verificação inicial
  app.get("/api/whatsapp/webhook", async (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode !== "subscribe" || typeof token !== "string") {
      res.status(400).send("Bad Request");
      return;
    }
    const db = await getDb();
    if (!db) {
      res.status(500).send("DB unavailable");
      return;
    }
    const r = await db
      .select()
      .from(whatsappConfig)
      .where(eq(whatsappConfig.verifyToken, token))
      .limit(1);
    if (r.length === 0) {
      res.status(403).send("Forbidden");
      return;
    }
    res.status(200).send(String(challenge ?? ""));
  });

  app.post("/api/whatsapp/webhook", async (req: Request, res: Response) => {
    // Responde rápido pra Meta
    res.status(200).json({ ok: true });
    try {
      await handleIncoming(req);
    } catch (e) {
      console.error("[webhook] error:", e);
    }
  });
}

async function handleIncoming(req: Request) {
  const body = (req as any).body as any;
  const raw = (req as any).rawBody as string;
  if (!body || body.object !== "whatsapp_business_account") return;
  const entries = body.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      if (change.field !== "messages") continue;
      const value = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const agent = await getAgentByPhoneNumberId(phoneNumberId);
      if (!agent) {
        console.warn("[webhook] no agent for phoneNumberId", phoneNumberId);
        continue;
      }
      const config = await getWhatsappConfig(agent.id);
      const sigHeader =
        req.headers["x-hub-signature-256"] || req.headers["X-Hub-Signature-256"];
      if (config?.appSecret) {
        const ok = verifyWebhookSignature(config.appSecret, raw, sigHeader);
        if (!ok) {
          console.warn("[webhook] invalid signature for agent", agent.id);
          continue;
        }
      }

      // Status updates (delivered/read/failed) → atualizar metadata, ignorado por enquanto
      if (Array.isArray(value.statuses)) {
        // poderíamos atualizar messages.waStatus aqui
      }

      const msgs = value.messages || [];
      const contacts = value.contacts || [];
      const contactName = contacts?.[0]?.profile?.name || null;

      for (const m of msgs) {
        const fromPhone: string = m.from;
        if (!fromPhone) continue;

        const leadId = await findOrCreateLead(agent.id, fromPhone, contactName);
        const convId = await findOrCreateConversation(agent.id, leadId);

        // Conteúdo recebido
        let inboundText = "";
        let contentType: any = "text";
        let mediaUrl: string | null = null;
        if (m.type === "text") {
          inboundText = m.text?.body || "";
        } else if (
          m.type === "image" ||
          m.type === "video" ||
          m.type === "audio" ||
          m.type === "document"
        ) {
          contentType = m.type;
          const waMediaId = m[m.type]?.id;
          const caption = m[m.type]?.caption || "";
          inboundText = caption || `[${m.type} recebida]`;
          mediaUrl = waMediaId ? `wa-media:${waMediaId}` : null;
          // Baixa, salva no storage e reconhece (áudio: Whisper, imagem: Vision)
          if (waMediaId && config?.accessToken && config?.phoneNumberId) {
            try {
              const lead = await findOrCreateLead(agent.id, fromPhone, contactName);
              const conv = await findOrCreateConversation(agent.id, lead);
              const dl = await downloadMedia(
                {
                  phoneNumberId: config.phoneNumberId,
                  accessToken: config.accessToken,
                  appSecret: config.appSecret,
                },
                waMediaId
              );
              if ("buffer" in dl) {
                const rec = await recognizeMedia(dl.buffer, dl.mimeType, dl.ext, {
                  agentId: agent.id,
                  conversationId: conv,
                  leadId: lead,
                });
                mediaUrl = rec.storedUrl ? absoluteStorageUrl(rec.storedUrl) : mediaUrl;
                inboundText = caption ? `${caption}\n\n${rec.text}` : rec.text;
              } else {
                console.warn("[webhook] media download failed:", dl.error);
              }
            } catch (err) {
              console.error("[webhook] media recognition failed:", err);
            }
          }
        } else if (m.type === "interactive") {
          inboundText =
            m.interactive?.button_reply?.title ||
            m.interactive?.list_reply?.title ||
            "[interação]";
        } else {
          inboundText = `[${m.type} recebida]`;
        }

        await appendMessage({
          conversationId: convId,
          direction: "inbound",
          sender: "lead",
          contentType,
          body: inboundText,
          mediaUrl,
          waMessageId: m.id,
          metadata: { from: fromPhone },
        });
        await recordMetric({
          agentId: agent.id,
          conversationId: convId,
          eventType: "message_received",
        });

        // Decidir se IA responde
        const conv = await getConversationById(convId);
        if (!conv) continue;
        if (conv.aiPaused || conv.status === "human_handoff") {
          continue; // humano vai responder
        }

        try {
          // Em vez de processar imediatamente, agenda o turno respeitando o debounce do agente.
          // Cada nova mensagem do lead empurra o pendingProcessAt para frente,
          // de modo que o bot espere o lead 'parar de digitar' antes de responder.
          const { setConversationPendingProcessAt } = await import("../db");
          const { nextProcessAt } = await import("../ai/humanize");
          const eta = nextProcessAt(agent);
          await setConversationPendingProcessAt(convId, eta);
          try {
            const { publish, bindConversationToAgent } = await import(
              "../realtime/bus"
            );
            bindConversationToAgent(convId, agent.id);
            publish(
              {
                type: "pipeline",
                conversationId: convId,
                phase: "scheduled",
                etaAt: eta.getTime(),
                label: `IA começa a digitar em ${Math.max(0, agent.debounceSeconds)}s`,
              },
              agent.id
            );
          } catch {
            // ignored
          }
        } catch (err) {
          console.error("[webhook] schedule debounce failed:", err);
        }
      }
    }
  }
}

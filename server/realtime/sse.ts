import type { Express, Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { getConversationById, getAgentById } from "../db";
import {
  subscribe,
  subscribeAgent,
  type RealtimeEvent,
} from "./bus";

/**
 * Endpoint SSE: GET /api/chat/stream/:conversationId
 *
 * Auth: cookie de sessão Manus (mesma lógica do tRPC).
 * Autorização: o usuário precisa estar logado e a conversa precisa existir;
 * (multi‑tenancy adicional pode ser plugado aqui no futuro).
 *
 * Eventos emitidos:
 *   - event: "message"      data: { type, conversationId, message }
 *   - event: "typing.agent" data: { type, conversationId, phase, stepName? }
 *   - event: "status"       data: { type, conversationId, patch }
 *
 * Heartbeat: comentários ":\n\n" a cada 25s para manter a conexão viva
 * em proxies (Cloud Run, nginx, etc.).
 */
export function registerRealtimeRoutes(app: Express) {
  app.get("/api/chat/stream/:conversationId", async (req: Request, res: Response) => {
    const conversationId = Number(req.params.conversationId);
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      res.status(400).json({ error: "invalid conversationId" });
      return;
    }

    // Auth: precisa de usuário logado
    try {
      await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    // Conversa precisa existir
    const conv = await getConversationById(conversationId);
    if (!conv) {
      res.status(404).json({ error: "conversation not found" });
      return;
    }

    // Headers SSE
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    // CORS é tratado pelo gateway; cookies vêm same-site mesmo
    if (typeof (res as any).flushHeaders === "function") {
      (res as any).flushHeaders();
    }

    // Hello inicial — confirma para o cliente que o stream está vivo
    res.write(`event: ready\ndata: ${JSON.stringify({ conversationId })}\n\n`);

    const send = (event: RealtimeEvent) => {
      try {
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        // conexão pode ter caído entre o flush e o write; o close handler limpa
      }
    };

    const unsubscribe = subscribe(conversationId, send);

    // Heartbeat anti‑idle
    const heartbeat = setInterval(() => {
      try {
        res.write(`: hb ${Date.now()}\n\n`);
      } catch {
        // ignored
      }
    }, 25_000);

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
      try {
        res.end();
      } catch {
        // ignored
      }
    };

    req.on("close", cleanup);
    req.on("aborted", cleanup);
    res.on("close", cleanup);
  });

  /**
   * Endpoint SSE global por agente: GET /api/live/stream?agentId=N
   *
   * Emite TODOS os eventos do bus que pertencem ao agente, em tempo real.
   * Usado pela página /live para mostrar lista de conversas ativas + chats
   * em andamento sem precisar abrir cada conversa individualmente.
   */
  app.get("/api/live/stream", async (req: Request, res: Response) => {
    const agentId = Number(req.query.agentId);
    if (!Number.isInteger(agentId) || agentId <= 0) {
      res.status(400).json({ error: "invalid agentId" });
      return;
    }

    try {
      await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const agent = await getAgentById(agentId);
    if (!agent) {
      res.status(404).json({ error: "agent not found" });
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof (res as any).flushHeaders === "function") {
      (res as any).flushHeaders();
    }

    res.write(`event: ready\ndata: ${JSON.stringify({ agentId })}\n\n`);

    const send = (event: RealtimeEvent) => {
      try {
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        // ignored
      }
    };

    const unsubscribe = subscribeAgent(agentId, send);

    const heartbeat = setInterval(() => {
      try {
        res.write(`: hb ${Date.now()}\n\n`);
      } catch {
        // ignored
      }
    }, 25_000);

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
      try {
        res.end();
      } catch {
        // ignored
      }
    };

    req.on("close", cleanup);
    req.on("aborted", cleanup);
    res.on("close", cleanup);
  });
}

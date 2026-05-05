import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerWhatsappWebhook } from "../whatsapp/webhook";
import { registerZapiWebhook } from "../whatsapp/zapiWebhook";
import { registerExternalEventsWebhook } from "../external/webhook";
import { registerRealtimeRoutes } from "../realtime/sse";
import { startFollowupEngine } from "../followup/engine";
import { startDebounceWorker } from "../ai/debounceWorker";
import {
  reconnectAllQrSessions,
  startBaileysLifecycle,
  stopBaileysLifecycle,
  flushPendingCreds,
} from "../whatsapp/baileys";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerWhatsappWebhook(app);
  registerZapiWebhook(app);
  registerExternalEventsWebhook(app);
  registerRealtimeRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    startFollowupEngine();
    startDebounceWorker();
    // ⚠️ Baileys (QR Code) NUNCA é iniciado automaticamente.
    // O QR só é gerado quando o usuário clica "Iniciar conexão" na UI.
    // Watchdog/heartbeat também permanecem desligados — isso evita que
    // o socket renasça sozinho, regenere QR em loop, ou tente reconectar
    // sem permissão explícita do usuário.
    console.log("[baileys] auto-start desabilitado — conexão on-demand");
  });

  // Shutdown gracioso: flush de creds pendentes + para watchdog/heartbeat
  // antes de encerrar. Evita perder o último snapshot do Signal state.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] received ${signal}, flushing pending creds…`);
    try {
      stopBaileysLifecycle();
      await flushPendingCreds();
      console.log("[shutdown] creds flushed");
    } catch (e) {
      console.warn("[shutdown] flush error:", (e as Error).message);
    } finally {
      server.close(() => process.exit(0));
      // Failsafe: se server.close demorar, força saída em 5s
      setTimeout(() => process.exit(0), 5000).unref();
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // SAFETY NETS process-level: erros não tratados em handlers assíncronos
  // (ex.: ECONNRESET no MySQL durante um event listener do Baileys) NUNCA
  // devem derrubar o processo — isso pararia o dispatcher e o usuário
  // veria mensagens "enviadas" no painel mas nada chegando no WhatsApp.
  process.on("uncaughtException", (err) => {
    console.error("[process] uncaughtException:", err?.message, err?.stack);
  });
  process.on("unhandledRejection", (reason) => {
    const r = reason as any;
    console.error(
      "[process] unhandledRejection:",
      r?.message ?? String(reason),
      r?.stack
    );
  });
}

startServer().catch(console.error);

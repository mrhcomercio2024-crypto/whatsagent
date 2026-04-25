/**
 * Conexão WhatsApp não oficial via Baileys (QR Code).
 *
 * AVISO: usa engenharia reversa do WhatsApp Web. Viola os Termos da Meta
 * e pode resultar em banimento do número. Use por conta e risco.
 *
 * Cada agente tem uma sessão própria, persistida em disco em
 * `WA_AUTH_DIR/agent-<id>` (default: ./.wa-sessions/agent-<id>).
 */
import {
  appendMessage,
  findOrCreateConversation,
  findOrCreateLead,
  getAgentById,
  getConversationById,
  getMediaById,
  listReconnectableQrSessions,
  recordMetric,
  upsertQrSession,
} from "../db";
import type { Agent } from "../../drizzle/schema";
import { processInboundForReply } from "../ai/orchestrator";
import { persistOutboundActions, type OutboundAction } from "../ai/orchestrator";
import path from "path";
import fs from "fs";
import qrcode from "qrcode";

// Lazy import — só carrega Baileys se for usado, evita peso ao boot
type WASocket = any;
type ConnectionState = any;

const sockets = new Map<number, WASocket>();
const statePromises = new Map<number, Promise<void>>();
const onOff = new Map<number, () => void>();

function authDirFor(agentId: number) {
  const base = process.env.WA_AUTH_DIR || path.join(process.cwd(), ".wa-sessions");
  if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
  const dir = path.join(base, `agent-${agentId}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Snapshot: serializa todo o conteúdo do diretório de auth state em JSON
 * (filename -> base64) e grava na coluna `authBlob` da sessão no banco.
 * Permite sobreviver a restarts em ambientes com filesystem efêmero.
 */
async function snapshotAuthDirToDb(agentId: number, dir: string) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter(f => !f.startsWith("."));
  const obj: Record<string, string> = {};
  for (const f of files) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isFile() && stat.size < 5_000_000) {
      obj[f] = fs.readFileSync(full).toString("base64");
    }
  }
  if (Object.keys(obj).length === 0) return;
  const blob = Buffer.from(JSON.stringify(obj)).toString("base64");
  await upsertQrSession(agentId, { authBlob: blob });
}

/**
 * Restaura o diretório de auth state a partir do snapshot salvo no banco.
 * Só escreve em disco arquivos que estão ausentes (não sobrescreve estado mais novo).
 */
async function restoreAuthDirFromDb(agentId: number, dir: string) {
  try {
    const { getQrSession } = await import("../db");
    const sess = await getQrSession(agentId);
    if (!sess?.authBlob) return;
    const obj = JSON.parse(
      Buffer.from(sess.authBlob, "base64").toString("utf8")
    ) as Record<string, string>;
    for (const [name, b64] of Object.entries(obj)) {
      const full = path.join(dir, name);
      if (fs.existsSync(full)) continue;
      fs.writeFileSync(full, Buffer.from(b64, "base64"));
    }
    console.log(
      `[baileys] agent ${agentId}: restored ${Object.keys(obj).length} auth files from DB`
    );
  } catch (e) {
    console.warn(
      `[baileys] restoreAuthDirFromDb failed for agent ${agentId}:`,
      (e as Error).message
    );
  }
}

/**
 * Inicia (ou reinicia) a sessão de QR para um agente.
 * Idempotente: se já há socket vivo, retorna o existente.
 */
export async function startQrSession(agentId: number): Promise<void> {
  if (sockets.has(agentId)) {
    return;
  }
  if (statePromises.has(agentId)) {
    return statePromises.get(agentId)!;
  }
  const p = bootSocket(agentId).finally(() => statePromises.delete(agentId));
  statePromises.set(agentId, p);
  return p;
}

async function bootSocket(agentId: number): Promise<void> {
  const baileys: any = await import("@whiskeysockets/baileys");
  const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers,
  } = baileys;

  const dir = authDirFor(agentId);
  // Restaura snapshot do banco (sobrevive a containers efêmeros) antes de instanciar.
  await restoreAuthDirFromDb(agentId, dir);
  await upsertQrSession(agentId, {
    status: "connecting",
    authDir: dir,
    lastError: null,
  });

  const { state, saveCreds: rawSaveCreds } = await useMultiFileAuthState(dir);
  // Persiste o snapshot do dir no banco a cada saveCreds.
  const saveCreds = async () => {
    try {
      await rawSaveCreds();
      await snapshotAuthDirToDb(agentId, dir);
    } catch (e) {
      console.warn(
        `[baileys] saveCreds snapshot failed for agent ${agentId}:`,
        (e as Error).message
      );
    }
  };
  let version: any;
  try {
    const v = await fetchLatestBaileysVersion();
    version = v.version;
  } catch {
    /* keep default */
  }

  const sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false,
    browser: Browsers.macOS("WhatsAgent"),
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sockets.set(agentId, sock);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (u: ConnectionState) => {
    const { connection, qr, lastDisconnect } = u as any;
    if (qr) {
      try {
        const dataUrl = await qrcode.toDataURL(qr, { width: 320, margin: 1 });
        await upsertQrSession(agentId, { status: "awaiting_qr", lastQr: dataUrl });
      } catch (e) {
        console.warn("[baileys] qr encode failed", (e as Error).message);
      }
    }
    if (connection === "open") {
      const jid = sock.user?.id || null;
      const name = sock.user?.name || sock.user?.verifiedName || null;
      await upsertQrSession(agentId, {
        status: "connected",
        lastQr: null,
        jid,
        displayName: name,
        lastConnectedAt: new Date(),
        lastError: null,
      });
      console.log(`[baileys] agent ${agentId} connected as ${jid}`);
    }
    if (connection === "close") {
      sockets.delete(agentId);
      const code = (lastDisconnect?.error as any)?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || "closed";
      const loggedOut = code === DisconnectReason?.loggedOut;
      const banned = code === 403 || /banned/i.test(reason);
      await upsertQrSession(agentId, {
        status: banned ? "banned" : loggedOut ? "logged_out" : "disconnected",
        lastError: reason,
      });
      console.warn(`[baileys] agent ${agentId} closed: ${reason} (code=${code})`);
      if (!loggedOut && !banned) {
        // tenta reconectar em 5s
        setTimeout(() => {
          startQrSession(agentId).catch(e =>
            console.warn("[baileys] reconnect failed", (e as Error).message)
          );
        }, 5000);
      }
    }
  });

  sock.ev.on("messages.upsert", async (ev: any) => {
    if (ev.type !== "notify") return;
    for (const msg of ev.messages || []) {
      try {
        await handleInbound(agentId, sock, msg);
      } catch (e) {
        console.error("[baileys] inbound failed", (e as Error).message);
      }
    }
  });
  console.log(`[baileys] agent ${agentId} socket booted, listening for messages`);
}

async function handleInbound(agentId: number, sock: WASocket, msg: any) {
  if (!msg.message) return;
  if (msg.key?.fromMe) return; // ignora ecos
  const remoteJid: string = msg.key?.remoteJid || "";
  if (!remoteJid || remoteJid.endsWith("@g.us")) return; // ignora grupos por padrão
  if (remoteJid.endsWith("@broadcast")) return;
  if (remoteJid === "status@broadcast") return;

  const phone = remoteJid.split("@")[0]?.split(":")[0] ?? remoteJid;
  const pushName: string | null = msg.pushName || null;

  // Extrai conteúdo
  let inboundText = "";
  let contentType: any = "text";
  let mediaUrl: string | null = null;

  const m = msg.message;
  if (m.conversation) {
    inboundText = m.conversation;
  } else if (m.extendedTextMessage?.text) {
    inboundText = m.extendedTextMessage.text;
  } else if (m.imageMessage) {
    contentType = "image";
    inboundText = m.imageMessage.caption || "[imagem recebida]";
  } else if (m.videoMessage) {
    contentType = "video";
    inboundText = m.videoMessage.caption || "[vídeo recebido]";
  } else if (m.audioMessage) {
    contentType = "audio";
    inboundText = "[áudio recebido]";
  } else if (m.documentMessage) {
    contentType = "document";
    inboundText = m.documentMessage.caption || "[documento recebido]";
  } else if (m.buttonsResponseMessage?.selectedDisplayText) {
    inboundText = m.buttonsResponseMessage.selectedDisplayText;
  } else if (m.listResponseMessage?.title) {
    inboundText = m.listResponseMessage.title;
  } else {
    inboundText = "[mensagem recebida]";
  }

  const agent = await getAgentById(agentId);
  if (!agent) {
    console.warn(`[baileys] inbound: agent ${agentId} not found in DB"`);
    return;
  }

  console.log(
    `[baileys] inbound from ${phone} for agent ${agentId}: ${inboundText.slice(0, 80)}`
  );

  const leadId = await findOrCreateLead(agentId, phone, pushName ?? undefined);
  const convId = await findOrCreateConversation(agentId, leadId);

  await appendMessage({
    conversationId: convId,
    direction: "inbound",
    sender: "lead",
    contentType,
    body: inboundText,
    mediaUrl,
    waMessageId: msg.key?.id ?? null,
    metadata: { from: phone, transport: "baileys" },
  });
  await recordMetric({
    agentId,
    conversationId: convId,
    eventType: "message_received",
  });

  const conv = await getConversationById(convId);
  if (!conv) return;
  if (conv.aiPaused || conv.status === "human_handoff") {
    console.log(
      `[baileys] conv ${convId} skipped (aiPaused=${conv.aiPaused}, status=${conv.status})`
    );
    return;
  }

  // Agenda o processamento respeitando o debounce do agente.
  const { setConversationPendingProcessAt } = await import("../db");
  const { nextProcessAt } = await import("../ai/humanize");
  const at = nextProcessAt(agent);
  await setConversationPendingProcessAt(convId, at);
  console.log(
    `[baileys] conv ${convId} scheduled to process at ${at.toISOString()} (debounce=${agent.debounceSeconds}s)`
  );
}

/**
 * Despacha ações pelo socket Baileys (texto, imagem, vídeo, documento).
 * Compatível com o mesmo contrato do dispatcher oficial.
 */
export async function dispatchViaBaileys(opts: {
  agent: Agent;
  conversationId: number;
  actions: OutboundAction[];
  sender: "ai" | "human";
}): Promise<void> {
  const { agent, conversationId, actions, sender } = opts;
  const sock = sockets.get(agent.id);
  if (!sock) {
    console.warn(`[baileys] no live socket for agent ${agent.id}; persisting only`);
    await persistOutboundActions({
      conversationId,
      agentId: agent.id,
      actions,
      sender,
    });
    return;
  }
  const conv = await getConversationById(conversationId);
  if (!conv) return;

  // Recupera o jid do lead a partir do telefone
  const phone = await getLeadPhone(conv.leadId);
  if (!phone) return;
  const jid = `${phone.replace(/\D/g, "")}@s.whatsapp.net`;

  // Helper de typing via Baileys (presence)
  const setTyping =
    sender === "ai" && agent.typingSimulationEnabled
      ? async (state: "on" | "off") => {
          try {
            await sock.presenceSubscribe(jid);
            await sock.sendPresenceUpdate(
              state === "on" ? "composing" : "paused",
              jid
            );
          } catch {
            /* ignora */
          }
        }
      : undefined;

  const waMessageIds: Array<string | undefined> = [];
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    if (sender === "ai") {
      const { simulateTypingForMessage, pauseBetweenMessages } = await import(
        "../ai/humanize"
      );
      const textLen =
        a.type === "text"
          ? a.text.length
          : Math.max(20, (await getMediaById(a.mediaId))?.caption?.length ?? 0);
      await simulateTypingForMessage({
        agent,
        textLength: textLen,
        setTyping,
      });
      if (i > 0) await pauseBetweenMessages(agent);
    }
    let id: string | undefined;
    try {
      if (a.type === "text") {
        const r = await sock.sendMessage(jid, { text: a.text });
        id = r?.key?.id ?? undefined;
      } else if (a.type === "media") {
        const m = await getMediaById(a.mediaId);
        if (m?.storageUrl) {
          const url = absolutize(m.storageUrl);
          if (m.mediaType === "image") {
            const r = await sock.sendMessage(jid, {
              image: { url },
              caption: m.caption || undefined,
            });
            id = r?.key?.id ?? undefined;
          } else if (m.mediaType === "video") {
            const r = await sock.sendMessage(jid, {
              video: { url },
              caption: m.caption || undefined,
            });
            id = r?.key?.id ?? undefined;
          } else if (m.mediaType === "audio") {
            const r = await sock.sendMessage(jid, {
              audio: { url },
              mimetype: m.mimeType || "audio/mp4",
              ptt: false,
            });
            id = r?.key?.id ?? undefined;
          } else {
            const r = await sock.sendMessage(jid, {
              document: { url },
              mimetype: m.mimeType || "application/pdf",
              fileName: m.name || "arquivo",
              caption: m.caption || undefined,
            });
            id = r?.key?.id ?? undefined;
          }
        }
      }
    } catch (e) {
      console.warn(`[baileys] send failed: ${(e as Error).message}`);
    }
    waMessageIds.push(id);
    await recordMetric({
      agentId: agent.id,
      conversationId,
      eventType: "message_sent",
      metadata: { transport: "baileys" },
    });
  }
  await persistOutboundActions({
    conversationId,
    agentId: agent.id,
    actions,
    sender,
    waMessageIds,
  });
}

async function getLeadPhone(leadId: number): Promise<string | null> {
  const { getLeadById } = await import("../db");
  const lead = await getLeadById(leadId);
  return lead?.phoneNumber ?? null;
}

function absolutize(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const base = process.env.PUBLIC_BASE_URL || "";
  if (!base) return url;
  return base.replace(/\/$/, "") + url;
}

/**
 * Encerra a sessão e desloga.
 */
export async function disconnectQrSession(agentId: number, wipe = false): Promise<void> {
  const sock = sockets.get(agentId);
  if (sock) {
    try {
      await sock.logout();
    } catch {
      try {
        sock.end();
      } catch { /* noop */ }
    }
    sockets.delete(agentId);
  }
  if (wipe) {
    const dir = authDirFor(agentId);
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch { /* noop */ }
  }
  await upsertQrSession(agentId, {
    status: "disconnected",
    lastQr: null,
    jid: null,
    displayName: null,
  });
  const off = onOff.get(agentId);
  if (off) {
    off();
    onOff.delete(agentId);
  }
}

export function isAgentConnected(agentId: number): boolean {
  return sockets.has(agentId);
}

/**
 * Religa todas as sessões Baileys que estavam ativas antes do restart.
 * Chamado no boot do servidor.
 */
export async function reconnectAllQrSessions(): Promise<void> {
  try {
    const rows = await listReconnectableQrSessions();
    if (!rows.length) {
      console.log("[baileys] no QR sessions to reconnect");
      return;
    }
    console.log(`[baileys] reconnecting ${rows.length} QR session(s)`);
    for (const r of rows) {
      // Confere se há credenciais persistidas em disco antes de tentar
      const dir = path.join(
        process.env.WA_AUTH_DIR || path.join(process.cwd(), ".wa-sessions"),
        `agent-${r.agentId}`
      );
      const credsFile = path.join(dir, "creds.json");
      if (!fs.existsSync(credsFile)) {
        // Antes de desistir, tenta restaurar do snapshot em DB.
        await restoreAuthDirFromDb(r.agentId, dir);
        if (!fs.existsSync(credsFile)) {
          console.warn(
            `[baileys] agent ${r.agentId}: no creds.json (disk or db), skipping reconnect`
          );
          await upsertQrSession(r.agentId, {
            status: "disconnected",
            lastError: "creds missing on disk after restart",
          });
          continue;
        }
      }
      startQrSession(r.agentId).catch(e =>
        console.warn(
          `[baileys] reconnect agent ${r.agentId} failed:`,
          (e as Error).message
        )
      );
    }
  } catch (e) {
    console.error("[baileys] reconnectAllQrSessions error:", (e as Error).message);
  }
}

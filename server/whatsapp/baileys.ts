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
import { recognizeMedia, absoluteStorageUrl } from "../ai/mediaRecognition";
import path from "path";
import fs from "fs";
import qrcode from "qrcode";
import {
  computeBackoffMs,
  scheduleReconnect,
  cancelReconnect,
  startWatchdog,
  startHeartbeat,
  stopWatchdog,
  stopHeartbeat,
} from "./reconnect";
import { enqueue as enqueueInbound } from "./inboundQueue";
import { debouncedSave, flushAll as flushAllCreds } from "./credsSaver";
import { acquireToken } from "./rateLimiter";
import {
  markConnected,
  markDisconnected,
  markReconnectAttempt,
  markInbound,
  markOutbound,
  markRateLimited,
  getStatsSnapshot,
} from "./runtimeStats";

// Lazy import — só carrega Baileys se for usado, evita peso ao boot
type WASocket = any;
type ConnectionState = any;

const sockets = new Map<number, WASocket>();
const statePromises = new Map<number, Promise<void>>();
const onOff = new Map<number, () => void>();
// Guarda o saveCreds "cru" por agente para permitir flush síncrono no shutdown.
const rawSavers = new Map<number, () => Promise<void>>();

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
  // Save "cru": escreve em disco + snapshot no banco. É o que de fato persiste.
  const rawSaver = async () => {
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
  rawSavers.set(agentId, rawSaver);
  // Versão debounced (2s): agrupa rajadas de `creds.update` em 1 execução,
  // evitando floodar o pool MySQL e o disco. O flush síncrono no shutdown
  // garante que o último estado não seja perdido.
  const saveCreds = debouncedSave(agentId, rawSaver, 2000);
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
      markConnected(agentId);
      cancelReconnect(agentId); // garantia: qualquer reconnect pendente é cancelado
      console.log(`[baileys] agent ${agentId} connected as ${jid}`);
    }
    if (connection === "close") {
      sockets.delete(agentId);
      const code = (lastDisconnect?.error as any)?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || "closed";
      const loggedOut = code === DisconnectReason?.loggedOut;
      const banned = code === 403 || /banned/i.test(reason);
      // QR refs attempts ended (code 408) = ninguém escaneou o QR a tempo.
      // Não adianta reconectar sem intervenção humana.
      const qrTimeout =
        code === 408 || /qr refs attempts ended/i.test(reason);
      // 'Connection Failure' e códigos 401/440/515 indicam credenciais inválidas/sessão expirada — tratar como logout
      // Erros recuperáveis: apenas reconectar, manter creds intactas
      const isRestartRequired =
        /restart required|stream errored \(restart required\)/i.test(reason) ||
        code === 515; // 515 = restart required
      // Erros terminais: credenciais inválidas, sessão realmente expirou
      const sessionExpired =
        !isRestartRequired &&
        !qrTimeout &&
        (/connection failure|conflict|forbidden|unauthorized/i.test(reason) ||
          code === 401 ||
          code === 403 ||
          code === 440);
      const treatAsLogout = loggedOut || sessionExpired;
      await upsertQrSession(agentId, {
        status: banned
          ? "banned"
          : treatAsLogout
          ? "logged_out"
          : qrTimeout
          ? "awaiting_qr"
          : isRestartRequired
          ? "connecting"
          : "disconnected",
        lastError: isRestartRequired ? null : qrTimeout ? "QR não escaneado a tempo—escaneie novamente" : reason,
      });
      console.warn(
        `[baileys] agent ${agentId} closed: ${reason} (code=${code}, restartRequired=${isRestartRequired}, sessionExpired=${sessionExpired}, qrTimeout=${qrTimeout})`
      );
      if (qrTimeout) {
        // Para o ciclo: aguarda o usuário clicar em "Conectar" novamente para gerar novo QR.
        markDisconnected(agentId, "qr_timeout");
        cancelReconnect(agentId);
        console.log(
          `[baileys] agent ${agentId}: QR não escaneado, parando reconnect automático (aguardando ação do usuário)`
        );
      } else if (treatAsLogout || banned) {
        // Apenas em casos terminais: apaga snapshot para não ressuscitar credenciais quebradas
        try {
          const dir = authDirFor(agentId);
          fs.rmSync(dir, { recursive: true, force: true });
          await upsertQrSession(agentId, { authBlob: null });
          console.log(
            `[baileys] agent ${agentId}: auth wiped after ${banned ? "ban" : "session expired"}`
          );
        } catch (err) {
          console.warn(
            `[baileys] auto-wipe failed for agent ${agentId}:`,
            (err as Error).message
          );
        }
      } else {
        // Quedas temporárias e Stream Errored (restart required): backoff exponencial.
        markDisconnected(agentId, reason);
        // Contador vive no runtimeStats: lemos e incrementamos de forma consistente.
        // Para restartRequired usamos backoff mais curto (base 1s); para os demais, 1.5s.
        const snap = getStatsSnapshot(agentId);
        const attempt = snap.reconnectAttempts + 1;
        const delay = computeBackoffMs(attempt, {
          baseMs: isRestartRequired ? 1000 : 1500,
          factor: 2,
          capMs: 60_000,
          jitterMs: 500,
        });
        markReconnectAttempt(agentId, delay);
        console.log(
          `[baileys] agent ${agentId} reconnect scheduled in ${delay}ms (attempt ${attempt}, restartRequired=${isRestartRequired})`
        );
        scheduleReconnect(agentId, delay, () => startQrSession(agentId));
      }
    }
  });

  sock.ev.on("messages.upsert", async (ev: any) => {
    if (ev.type !== "notify") return;
    for (const msg of ev.messages || []) {
      // Enfileira por conversa (agentId:remoteJid): garante ordem FIFO e evita
      // races no debounce/orchestrator quando várias mensagens da mesma pessoa
      // chegam simultaneamente.
      const rjid: string = msg?.key?.remoteJid || "unknown";
      const key = `${agentId}:${rjid}`;
      enqueueInbound(key, async () => {
        try {
          await handleInbound(agentId, sock, msg);
        } catch (e) {
          console.error("[baileys] inbound failed", (e as Error).message);
        }
      });
    }
  });

  // Captura presença do lead (composing/paused/recording) e republica no bus
  // realtime para a UI "ao vivo". Mapeia o remoteJid para conversationId via
  // lookup direto (lead_phone -> lead -> conversation).
  sock.ev.on("presence.update", async (ev: any) => {
    try {
      const remoteJid: string | undefined = ev?.id;
      const presences = ev?.presences;
      if (!remoteJid || !presences) return;

      // Pega a presença do próprio remoteJid (1:1) ou a primeira (grupos não suportados aqui)
      const entry =
        presences[remoteJid] ??
        Object.values(presences as Record<string, any>)[0];
      if (!entry || typeof entry.lastKnownPresence !== "string") return;

      const phase = mapPresenceToLeadPhase(entry.lastKnownPresence);
      if (!phase) return;

      // Resolve conversationId a partir do remoteJid
      const phone = remoteJid.replace(/[@:].*/, "").replace(/\D+/g, "");
      if (!phone) return;
      const { findLeadByPhone, findConversationByLeadId } = await import(
        "../db"
      );
      const lead = await findLeadByPhone(agentId, phone);
      if (!lead) return;
      const conv = await findConversationByLeadId(lead.id);
      if (!conv) return;

      const { publish, bindConversationToAgent } = await import(
        "../realtime/bus"
      );
      bindConversationToAgent(conv.id, agentId);
      publish({
        type: "typing.lead",
        conversationId: conv.id,
        phase,
      });
    } catch (e) {
      // best-effort: presence falhou não impacta nada
      console.warn(
        "[baileys] presence.update handler failed:",
        (e as Error).message
      );
    }
  });

  console.log(`[baileys] agent ${agentId} socket booted, listening for messages`);
}

function mapPresenceToLeadPhase(
  p: string
):
  | "composing"
  | "recording"
  | "paused"
  | "idle"
  | null {
  if (p === "composing") return "composing";
  if (p === "recording") return "recording";
  if (p === "paused") return "paused";
  if (p === "available" || p === "unavailable") return "idle";
  return null;
}

/**
 * Decide se uma mensagem inbound deve ser processada ou descartada.
 * Exposta para teste (unit test).
 */
/**
 * Resolve o número de telefone real (E.164 sem +) a partir dos campos de uma mensagem.
 * Lida com o novo formato @lid do WhatsApp Multi-Device, onde remoteJid pode ser um LID interno
 * e o número real fica em senderPn / participantPn.
 */
export function resolveRealPhone(params: {
  remoteJid: string | undefined | null;
  senderPn?: string | undefined | null;
  participant?: string | undefined | null;
  participantPn?: string | undefined | null;
}): { phone: string | null; jidForSend: string | null; isLid: boolean } {
  const remoteJid = (params.remoteJid || "").trim();
  const isLid = remoteJid.endsWith("@lid");
  // Tentar fontes na ordem: senderPn (mais confiável), participantPn, participant, remoteJid
  const candidates = [
    params.senderPn,
    params.participantPn,
    params.participant,
    remoteJid,
  ].filter((x): x is string => !!x && typeof x === "string");
  for (const c of candidates) {
    const local = (c.split("@")[0] ?? c).split(":")[0] ?? c;
    const digits = local.replace(/\D/g, "");
    if (!digits) continue;
    // Se o JID original é @lid e essa fonte também é @lid, não serve como número real
    if (c.endsWith("@lid") && isLid) continue;
    // Heurística: telefones reais têm 8–15 dígitos. LIDs costumam ter 14–16.
    // Só aceitamos como "real" se vier de uma fonte não-LID.
    if (!c.endsWith("@lid")) {
      return {
        phone: digits,
        jidForSend: `${digits}@s.whatsapp.net`,
        isLid: false,
      };
    }
  }
  // Nenhuma fonte não-LID disponível. Se temos um LID, usamos ele para envio (Baileys aceita @lid).
  if (isLid) {
    const local = (remoteJid.split("@")[0] ?? remoteJid).split(":")[0] ?? remoteJid;
    const digits = local.replace(/\D/g, "");
    return {
      phone: digits || null,
      jidForSend: digits ? `${digits}@lid` : null,
      isLid: true,
    };
  }
  // Último fallback: extrair do remoteJid mesmo
  const local = (remoteJid.split("@")[0] ?? remoteJid).split(":")[0] ?? remoteJid;
  const digits = local.replace(/\D/g, "");
  return {
    phone: digits || null,
    jidForSend: digits ? `${digits}@s.whatsapp.net` : null,
    isLid: false,
  };
}

export function shouldProcessInbound(params: {
  fromMe: boolean | undefined;
  remoteJid: string | undefined | null;
  selfJid: string | undefined | null;
  hasMessage: boolean;
}): { accept: boolean; reason?: string; phone?: string } {
  if (!params.hasMessage) return { accept: false, reason: "no_message" };
  if (params.fromMe) return { accept: false, reason: "from_me" };
  const remoteJid = (params.remoteJid || "").trim();
  if (!remoteJid) return { accept: false, reason: "empty_remote_jid" };
  // Bloqueia grupos, broadcasts, status, newsletters, canais
  if (remoteJid.endsWith("@g.us")) return { accept: false, reason: "group" };
  if (remoteJid === "status@broadcast") return { accept: false, reason: "status" };
  if (remoteJid.endsWith("@broadcast")) return { accept: false, reason: "broadcast" };
  if (remoteJid.endsWith("@newsletter")) return { accept: false, reason: "newsletter" };
  // Extrai telefone normalizado
  const phone = (remoteJid.split("@")[0] ?? remoteJid).split(":")[0] ?? remoteJid;
  const phoneDigits = phone.replace(/\D/g, "");
  if (!phoneDigits) return { accept: false, reason: "no_digits" };
  // Bloqueia self-message: se o remoteJid (ou só o número) bate com o JID do próprio dono
  const selfJid = (params.selfJid || "").trim();
  if (selfJid) {
    const selfPhone = (selfJid.split("@")[0] ?? selfJid).split(":")[0] ?? selfJid;
    const selfDigits = selfPhone.replace(/\D/g, "");
    if (selfDigits && selfDigits === phoneDigits) {
      return { accept: false, reason: "self_message" };
    }
  }
  return { accept: true, phone: phoneDigits };
}

async function handleInbound(agentId: number, sock: WASocket, msg: any) {
  const selfJid: string | null = sock?.user?.id ?? null;
  const decision = shouldProcessInbound({
    fromMe: msg.key?.fromMe,
    remoteJid: msg.key?.remoteJid,
    selfJid,
    hasMessage: !!msg.message,
  });
  if (!decision.accept) {
    if (decision.reason && decision.reason !== "no_message" && decision.reason !== "from_me") {
      console.log(
        `[baileys] inbound rejected (agent=${agentId}, reason=${decision.reason}, remoteJid=${msg.key?.remoteJid})`
      );
    }
    return;
  }
  const remoteJid: string = msg.key?.remoteJid || "";
  // Resolve o número REAL: lida com remoteJid @lid e prefere senderPn se disponível
  const resolved = resolveRealPhone({
    remoteJid,
    senderPn: msg.key?.senderPn,
    participant: msg.key?.participant,
    participantPn: msg.key?.participantPn,
  });
  const phone = resolved.phone || decision.phone!;
  if (resolved.isLid) {
    console.warn(
      `[baileys] agent ${agentId}: lead salvo a partir de @lid (sem senderPn) — phone=${phone}. Mensagem será enviada usando @lid.`
    );
  }
  const pushName: string | null = msg.pushName || null;

  // Extrai conteúdo
  let inboundText = "";
  let contentType: any = "text";
  let mediaUrl: string | null = null;

  const m = msg.message;
  let mediaInfo:
    | { kind: "image" | "audio" | "video" | "document"; caption: string; mimeType: string }
    | null = null;
  if (m.conversation) {
    inboundText = m.conversation;
  } else if (m.extendedTextMessage?.text) {
    inboundText = m.extendedTextMessage.text;
  } else if (m.imageMessage) {
    contentType = "image";
    mediaInfo = {
      kind: "image",
      caption: m.imageMessage.caption || "",
      mimeType: m.imageMessage.mimetype || "image/jpeg",
    };
    inboundText = mediaInfo.caption || "[imagem recebida]";
  } else if (m.videoMessage) {
    contentType = "video";
    mediaInfo = {
      kind: "video",
      caption: m.videoMessage.caption || "",
      mimeType: m.videoMessage.mimetype || "video/mp4",
    };
    inboundText = mediaInfo.caption || "[vídeo recebido]";
  } else if (m.audioMessage) {
    contentType = "audio";
    mediaInfo = {
      kind: "audio",
      caption: "",
      mimeType: m.audioMessage.mimetype || "audio/ogg",
    };
    inboundText = "[áudio recebido]";
  } else if (m.documentMessage) {
    contentType = "document";
    mediaInfo = {
      kind: "document",
      caption: m.documentMessage.caption || "",
      mimeType: m.documentMessage.mimetype || "application/octet-stream",
    };
    inboundText = mediaInfo.caption || "[documento recebido]";
  } else if (m.buttonsResponseMessage?.selectedDisplayText) {
    inboundText = m.buttonsResponseMessage.selectedDisplayText;
  } else if (m.listResponseMessage?.title) {
    inboundText = m.listResponseMessage.title;
  } else {
    inboundText = "[mensagem recebida]";
  }

  // Tenta baixar e reconhecer mídia (Whisper/Vision) — apenas áudio e imagem disparam reconhecimento
  if (mediaInfo) {
    try {
      const baileys = await import("@whiskeysockets/baileys");
      const downloadFn: any = (baileys as any).downloadMediaMessage;
      if (typeof downloadFn === "function") {
        const buf: Buffer = await downloadFn(
          msg,
          "buffer",
          {},
          { reuploadRequest: sock.updateMediaMessage }
        );
        const ext = (mediaInfo.mimeType.split("/")[1] || "bin").split(";")[0] || "bin";
        const lead = await findOrCreateLead(agentId, phone, pushName ?? undefined, { isLid: resolved.isLid });
        const conv = await findOrCreateConversation(agentId, lead);
        const rec = await recognizeMedia(buf, mediaInfo.mimeType, ext, {
          agentId,
          conversationId: conv,
          leadId: lead,
        });
        if (rec.storedUrl) mediaUrl = absoluteStorageUrl(rec.storedUrl);
        if (rec.text) {
          inboundText = mediaInfo.caption
            ? `${mediaInfo.caption}\n\n${rec.text}`
            : rec.text;
        }
      }
    } catch (err) {
      console.error("[baileys] media recognition failed:", err);
    }
  }

  const agent = await getAgentById(agentId);
  if (!agent) {
    console.warn(`[baileys] inbound: agent ${agentId} not found in DB"`);
    return;
  }

  console.log(
    `[baileys] inbound from ${phone} for agent ${agentId}: ${inboundText.slice(0, 80)}`
  );

  const leadId = await findOrCreateLead(agentId, phone, pushName ?? undefined, { isLid: resolved.isLid });
  const convId = await findOrCreateConversation(agentId, leadId);

  markInbound(agentId);
  await appendMessage({
    conversationId: convId,
    direction: "inbound",
    sender: "lead",
    contentType,
    body: inboundText,
    mediaUrl,
    waMessageId: msg.key?.id ?? null,
    metadata: {
      from: phone,
      transport: "baileys",
      remoteJid,
      isLid: resolved.isLid,
      senderPn: msg.key?.senderPn ?? null,
    },
  });
  await recordMetric({
    agentId,
    conversationId: convId,
    eventType: "message_received",
  });

  // Cancela retries pendentes desta conversa: o lead acabou de responder, então
  // mensagens "pendentes de reenvio" perdem o sentido (não queremos mandar
  // "Boa tarde, tudo bem?" 5 minutos depois do lead já ter retomado o papo).
  try {
    const { cancelPendingRetriesForConversation } = await import("../db");
    const cancelled = await cancelPendingRetriesForConversation(convId, "cancelled_by_reply");
    if (cancelled > 0) {
      console.log(
        `[baileys] conv ${convId} inbound: cancelled ${cancelled} pending retry/retries`
      );
    }
  } catch (e) {
    console.warn(`[baileys] failed to cancel retries on inbound: ${(e as Error).message}`);
  }

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
  const { agent, conversationId, sender } = opts;
  const { splitMessage } = await import("../ai/splitter");
  const actions: OutboundAction[] =
    sender === "ai"
      ? opts.actions.flatMap<OutboundAction>((a) =>
          a.type === "text"
            ? splitMessage(a.text, {
                enabled: agent.splitLongMessages,
                maxChars: agent.splitMaxChars,
              }).map((piece) => ({ type: "text" as const, text: piece }))
            : [a],
        )
      : opts.actions;
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
  const leadDigits = phone.replace(/\D/g, "");
  if (!leadDigits) {
    console.warn(`[baileys] dispatch aborted: lead sem número válido (conv=${conversationId})`);
    return;
  }
  // Usa flag isLid persistida no lead pelo handleInbound: se a conversa veio de um @lid,
  // o envio deve ser para `<id>@lid`, não para `<id>@s.whatsapp.net` (que o WhatsApp descarta).
  const isLidLead = await getLeadIsLid(conv.leadId);
  const jid = isLidLead
    ? `${leadDigits}@lid`
    : `${leadDigits}@s.whatsapp.net`;
  if (isLidLead) {
    console.log(
      `[baileys] dispatch: lead.isLid=true; enviando para ${jid}`
    );
  }
  // Blindagem final: jamais envia para o próprio JID (evita loop de auto-resposta)
  const selfJid: string | null = sock?.user?.id ?? null;
  if (selfJid) {
    const selfDigits = ((selfJid.split("@")[0] ?? selfJid).split(":")[0] ?? selfJid).replace(/\D/g, "");
    if (selfDigits && selfDigits === leadDigits) {
      console.error(
        `[baileys] DISPATCH ABORTADO: lead=${leadDigits} igual ao self=${selfDigits} (auto-resposta evitada; conv=${conversationId})`
      );
      await persistOutboundActions({
        conversationId,
        agentId: agent.id,
        actions,
        sender,
      });
      return;
    }
  }

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
      const {
        simulateTypingForMessage,
        pauseBetweenMessages,
        pauseBeforeMedia,
        pauseAfterMedia,
      } = await import("../ai/humanize");
      const prev = i > 0 ? actions[i - 1] : undefined;
      // Pausa entre mensagens consecutivas (depende do tipo anterior)
      if (i > 0) {
        if (prev?.type === "media") {
          await pauseAfterMedia(agent);
        } else {
          await pauseBetweenMessages(agent);
        }
      }
      // Pausa extra ANTES de mídia (humano "procurando/anexando")
      if (a.type === "media" && i > 0) {
        await pauseBeforeMedia(agent);
      }
      // Typing apenas para texto
      if (a.type === "text") {
        await simulateTypingForMessage({
          agent,
          textLength: a.text.length,
          setTyping,
        });
      }
    }
    // Rate limit: evita ban por rajada. Espera (sem rejeitar) até liberar token.
    const limit = await acquireToken(agent.id, {
      maxPerWindow: 20,
      windowMs: 60_000,
    });
    if (limit.waitedMs > 0) {
      markRateLimited(agent.id);
      console.log(
        `[baileys] rate limited agent=${agent.id} waited=${limit.waitedMs}ms`
      );
    }
    let id: string | undefined;
    let sendOk = false;
    let lastErrorMsg: string | null = null;
    try {
      // Wrap every sendMessage with a hard 20s timeout. Sem isso, um envio para
      // @lid que nunca confirma o ack pode segurar o orchestrator por minutos
      // e bloquear o próximo turno do mesmo lead. 20s é bem acima do RTT
      // normal (200–2000ms) e captura apenas casos verdadeiramente travados.
      const sendWithTimeout = (payload: any) =>
        Promise.race([
          sock.sendMessage(jid, payload),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("sendMessage timeout (20s)")),
              20_000
            )
          ),
        ]) as Promise<{ key?: { id?: string } } | undefined>;

      if (a.type === "text") {
        const r = await sendWithTimeout({ text: a.text });
        id = r?.key?.id ?? undefined;
        sendOk = true;
      } else if (a.type === "media") {
        const m = await getMediaById(a.mediaId);
        if (m?.storageUrl) {
          const url = absolutize(m.storageUrl);
          if (m.mediaType === "image") {
            const r = await sendWithTimeout({
              image: { url },
              caption: m.caption || undefined,
            });
            id = r?.key?.id ?? undefined;
            sendOk = true;
          } else if (m.mediaType === "video") {
            const r = await sendWithTimeout({
              video: { url },
              caption: m.caption || undefined,
            });
            id = r?.key?.id ?? undefined;
            sendOk = true;
          } else if (m.mediaType === "audio") {
            const r = await sendWithTimeout({
              audio: { url },
              mimetype: m.mimeType || "audio/mp4",
              ptt: false,
            });
            id = r?.key?.id ?? undefined;
            sendOk = true;
          } else {
            const r = await sendWithTimeout({
              document: { url },
              mimetype: m.mimeType || "application/pdf",
              fileName: m.name || "arquivo",
              caption: m.caption || undefined,
            });
            id = r?.key?.id ?? undefined;
            sendOk = true;
          }
        }
      }
    } catch (e) {
      lastErrorMsg = (e as Error).message;
      console.warn(
        `[baileys] send failed (jid=${jid}, type=${a.type}): ${lastErrorMsg}`
      );
    }
    waMessageIds.push(id);
    markOutbound(agent.id, sendOk);

    // Enfileira retry se o envio não foi confirmado e não estamos já dentro
    // de uma execução do retry-worker (evita loop). O "já dentro do worker"
    // é sinalizado por opts.__isRetry (passado pelo retry-worker).
    const __isRetry = (opts as any).__isRetry as { retryId: number } | undefined;
    if (!sendOk && !__isRetry) {
      try {
        const { enqueueMessageRetry } = await import("../db");
        const { nextRetryAt } = await import("./retryBackoff");
        const payload =
          a.type === "text"
            ? { type: "text", text: a.text }
            : { type: "media", mediaId: (a as any).mediaId };
        await enqueueMessageRetry({
          agentId: agent.id,
          conversationId,
          leadId: conv.leadId,
          payload: payload as any,
          sender: sender === "ai" ? "ai" : "operator",
          attempt: 0,
          maxAttempts: 5,
          nextRetryAt: nextRetryAt(1),
          status: "pending",
          lastError: lastErrorMsg ?? "send did not confirm",
        });
        console.log(
          `[baileys] enqueued retry for failed send (conv=${conversationId}, type=${a.type})`
        );
      } catch (eq) {
        console.error(
          `[baileys] failed to enqueue retry: ${(eq as Error).message}`
        );
      }
    }
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

async function getLeadIsLid(leadId: number): Promise<boolean> {
  const { getLeadById } = await import("../db");
  const lead = await getLeadById(leadId);
  return !!(lead as any)?.isLid;
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
  // Para de tentar reconectar imediatamente — usuário pediu disconnect explícito.
  cancelReconnect(agentId);
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
  rawSavers.delete(agentId);
  markDisconnected(agentId, wipe ? "manual_wipe" : "manual_disconnect");
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
    lastError: null,
    // Quando wipe=true, também apaga o snapshot do banco para não restaurar credenciais antigas no próximo boot
    ...(wipe ? { authBlob: null } : {}),
  });
  const off = onOff.get(agentId);
  if (off) {
    off();
    onOff.delete(agentId);
  }
}

export function isAgentConnected(agentId: number): boolean {
  const sock = sockets.get(agentId);
  if (!sock) return false;
  // Considera conectado apenas se o socket completou o login (tem user.id).
  // Sem isso, o heartbeat e o envio falham com "Cannot read properties of undefined".
  return Boolean((sock as any).user?.id);
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

/**
 * Retorna lista de agentes que têm sessão QR conhecida (vivos ou não).
 * Usada pelo watchdog para saber quem deveria estar conectado.
 */
async function listKnownQrAgents(): Promise<Array<{ agentId: number }>> {
  try {
    const rows = await listReconnectableQrSessions();
    return rows
      .map((r: any) => ({ agentId: r.agentId }))
      .filter((r: { agentId: number }) => typeof r.agentId === "number");
  } catch {
    return [];
  }
}

/**
 * Envia um heartbeat (presence 'available') para manter a conexão viva
 * e detectar sockets mortos. No-op se o socket não estiver presente.
 */
async function sendBaileysHeartbeat(agentId: number): Promise<void> {
  const sock = sockets.get(agentId);
  if (!sock) return;
  // Heartbeat só faz sentido em sockets autenticados; sem user.id o Baileys
  // tenta acessar user.name e quebra com "Cannot read properties of undefined".
  if (!(sock as any).user?.id) return;
  try {
    await sock.sendPresenceUpdate?.("available");
  } catch (e) {
    // Se falhar, o `connection.update` fechará e o fluxo normal reconecta.
    console.warn(
      `[baileys] heartbeat failed for agent ${agentId}:`,
      (e as Error).message
    );
  }
}

/**
 * Inicia watchdog + heartbeat globais. Idempotente.
 * Deve ser chamado no boot do servidor, depois de reconnectAllQrSessions.
 */
export function startBaileysLifecycle(): void {
  startWatchdog(
    {
      isConnected: (id) => isAgentConnected(id),
      listAgents: listKnownQrAgents,
      startSession: (id) => startQrSession(id),
      getLastActivityAt: (id) => getStatsSnapshot(id).lastActivityAt,
      sendHeartbeat: (id) => sendBaileysHeartbeat(id),
    },
    { intervalMs: 60_000, staleMs: 5 * 60_000 }
  );
  startHeartbeat(
    {
      isConnected: (id) => isAgentConnected(id),
      listAgents: listKnownQrAgents,
      sendHeartbeat: (id) => sendBaileysHeartbeat(id),
    },
    { intervalMs: 30_000 }
  );
  // Worker de reenvio automático de mensagens que falharam.
  void import("./retryWorker").then(({ startRetryWorker }) => startRetryWorker());
}

/**
 * Para watchdog + heartbeat. Útil em shutdown.
 */
export function stopBaileysLifecycle(): void {
  stopWatchdog();
  stopHeartbeat();
  void import("./retryWorker").then(({ stopRetryWorker }) => stopRetryWorker());
}

/**
 * Flush síncrono de creds pendentes (debounce) antes de encerrar o processo.
 * Chamado no handler de SIGTERM/SIGINT.
 */
export async function flushPendingCreds(): Promise<void> {
  await flushAllCreds((agentId) => {
    const saver = rawSavers.get(agentId);
    return saver ?? (async () => {});
  });
}

/**
 * Snapshot de métricas runtime de um agente (para Dashboard).
 */
export function getAgentRuntimeStats(agentId: number) {
  return {
    ...getStatsSnapshot(agentId),
    live: isAgentConnected(agentId),
  };
}

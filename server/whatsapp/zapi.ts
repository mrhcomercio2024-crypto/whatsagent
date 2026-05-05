/**
 * Cliente Z-API (provedor não-oficial de WhatsApp).
 * Cada agente pode ter sua própria instância configurada em `zapi_instances`.
 *
 * Documentação: https://developer.z-api.io/
 *
 * Convenções:
 * - Base URL: https://api.z-api.io/instances/{instanceId}/token/{token}
 * - Header `Client-Token` opcional (token de segurança da conta)
 * - Webhook (Ao receber) chega em POST /api/zapi/:agentId/inbound (configurar
 *   no painel da Z-API com o Webhook Secret retornado por listInstance procedure)
 */

export type ZapiCredentials = {
  instanceId: string;
  token: string;
  clientToken?: string | null;
};

export type ZapiSendResult = {
  ok: boolean;
  messageId?: string;
  zaapId?: string;
  error?: string;
  raw?: unknown;
};

const ZAPI_BASE = "https://api.z-api.io/instances";

function buildUrl(creds: ZapiCredentials, path: string): string {
  return `${ZAPI_BASE}/${encodeURIComponent(creds.instanceId)}/token/${encodeURIComponent(creds.token)}/${path}`;
}

function buildHeaders(creds: ZapiCredentials): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (creds.clientToken) headers["Client-Token"] = creds.clientToken;
  return headers;
}

/**
 * Sanitiza um número de telefone para o formato esperado pela Z-API
 * (apenas dígitos, com DDI: ex 5511999999999). Aceita já no formato JID
 * "5511999999999@c.us" e retorna sem o sufixo.
 */
export function normalizePhone(input: string): string {
  if (!input) return "";
  return input.split("@")[0].replace(/\D/g, "");
}

async function callZapi(
  creds: ZapiCredentials,
  path: string,
  body: Record<string, unknown>
): Promise<ZapiSendResult> {
  if (!creds.instanceId || !creds.token) {
    return { ok: false, error: "Z-API não configurada (faltam instanceId/token)" };
  }
  try {
    const res = await fetch(buildUrl(creds, path), {
      method: "POST",
      headers: buildHeaders(creds),
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      messageId?: string;
      zaapId?: string;
      id?: string;
      error?: string;
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error || data?.message || `HTTP ${res.status}`,
        raw: data,
      };
    }
    return {
      ok: true,
      messageId: data.messageId || data.id,
      zaapId: data.zaapId,
      raw: data,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function sendText(
  creds: ZapiCredentials,
  phone: string,
  message: string,
  opts: { delayMessage?: number; delayTyping?: number } = {}
): Promise<ZapiSendResult> {
  return callZapi(creds, "send-text", {
    phone: normalizePhone(phone),
    message,
    ...(opts.delayMessage ? { delayMessage: opts.delayMessage } : {}),
    ...(opts.delayTyping ? { delayTyping: opts.delayTyping } : {}),
  });
}

export async function sendImage(
  creds: ZapiCredentials,
  phone: string,
  imageUrl: string,
  caption?: string
): Promise<ZapiSendResult> {
  return callZapi(creds, "send-image", {
    phone: normalizePhone(phone),
    image: imageUrl,
    ...(caption ? { caption } : {}),
  });
}

export async function sendAudio(
  creds: ZapiCredentials,
  phone: string,
  audioUrl: string
): Promise<ZapiSendResult> {
  return callZapi(creds, "send-audio", {
    phone: normalizePhone(phone),
    audio: audioUrl,
  });
}

export async function sendVideo(
  creds: ZapiCredentials,
  phone: string,
  videoUrl: string,
  caption?: string
): Promise<ZapiSendResult> {
  return callZapi(creds, "send-video", {
    phone: normalizePhone(phone),
    video: videoUrl,
    ...(caption ? { caption } : {}),
  });
}

export async function sendDocument(
  creds: ZapiCredentials,
  phone: string,
  documentUrl: string,
  fileName?: string,
  extension = "pdf"
): Promise<ZapiSendResult> {
  // O endpoint da Z-API tem a extensão na URL
  return callZapi(creds, `send-document/${encodeURIComponent(extension)}`, {
    phone: normalizePhone(phone),
    document: documentUrl,
    ...(fileName ? { fileName } : {}),
  });
}

/**
 * Envia o status de presença ("digitando", "gravando", etc.) para um chat.
 * Equivale ao indicator "...digitando" que aparece no WhatsApp do lead.
 *
 * Status válidos na Z-API:
 *   - composing  → mostra "digitando..."
 *   - recording  → mostra "gravando áudio..."
 *   - available  → online
 *   - unavailable → offline
 *
 * Documentação: https://developer.z-api.io/message/send-message-presence
 */
export async function sendPresence(
  creds: ZapiCredentials,
  phone: string,
  status: "composing" | "recording" | "available" | "unavailable" = "composing",
  durationMs?: number
): Promise<ZapiSendResult> {
  return callZapi(creds, "send-message-presence", {
    phone: normalizePhone(phone),
    status,
    ...(durationMs ? { delay: durationMs } : {}),
  });
}

export type ZapiStatus = {
  connected: boolean;
  session: boolean;
  smartphoneConnected: boolean;
  raw?: unknown;
};

/**
 * Health check da instância via GET /status.
 */
export async function getStatus(
  creds: ZapiCredentials
): Promise<{ ok: true; data: ZapiStatus } | { ok: false; error: string }> {
  if (!creds.instanceId || !creds.token) {
    return { ok: false, error: "Z-API não configurada" };
  }
  try {
    const res = await fetch(buildUrl(creds, "status"), {
      method: "GET",
      headers: buildHeaders(creds),
    });
    const data = (await res.json().catch(() => ({}))) as {
      connected?: boolean;
      session?: boolean;
      smartphoneConnected?: boolean;
      error?: string;
    };
    if (!res.ok) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` };
    }
    return {
      ok: true,
      data: {
        connected: Boolean(data.connected),
        session: Boolean(data.session),
        smartphoneConnected: Boolean(data.smartphoneConnected),
        raw: data,
      },
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Verifica assinatura HMAC do webhook Z-API.
 *
 * A Z-API não envia HMAC nativo; usamos um secret embutido na URL
 * (`/api/zapi/:agentId/inbound?secret=<hex>`) que cada instância tem
 * armazenado em `zapi_instances.webhookSecret`. Esta função valida
 * que o secret recebido bate com o esperado, em tempo constante.
 */
export function verifyWebhookSecret(
  expected: string | null | undefined,
  received: string | string[] | undefined
): boolean {
  if (!expected) return false;
  const got = Array.isArray(received) ? received[0] : received;
  if (!got) return false;
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Tipo do payload do webhook "Ao receber" da Z-API.
 * Apenas os campos que utilizamos. A doc completa está em
 * https://developer.z-api.io/webhooks/on-message-received-examples
 */
export type ZapiInboundWebhook = {
  type?: string;
  instanceId?: string;
  messageId?: string;
  phone?: string;
  fromMe?: boolean;
  isGroup?: boolean;
  isNewsletter?: boolean;
  momment?: number;
  status?: string;
  chatName?: string;
  senderName?: string;
  senderPhoto?: string;
  text?: { message?: string };
  image?: { imageUrl?: string; mimeType?: string; caption?: string };
  audio?: { audioUrl?: string; mimeType?: string };
  video?: { videoUrl?: string; mimeType?: string; caption?: string };
  document?: { documentUrl?: string; mimeType?: string; fileName?: string; title?: string };
  connectedPhone?: string;
};

/**
 * Extrai o conteúdo (texto, mídia URL e tipo) de um webhook inbound.
 * Retorna `null` quando é uma mensagem sem conteúdo suportado (ex: status, reaction etc.).
 */
export function extractInboundContent(
  payload: ZapiInboundWebhook
): { text: string | null; mediaUrl?: string; mediaType?: string; mimeType?: string; fileName?: string } | null {
  if (payload.fromMe) return null; // ignoramos mensagens enviadas por nós mesmos
  if (payload.isGroup) return null; // por enquanto não tratamos grupos
  if (payload.text?.message) {
    return { text: payload.text.message };
  }
  if (payload.image?.imageUrl) {
    return {
      text: payload.image.caption || null,
      mediaUrl: payload.image.imageUrl,
      mediaType: "image",
      mimeType: payload.image.mimeType,
    };
  }
  if (payload.audio?.audioUrl) {
    return {
      text: null,
      mediaUrl: payload.audio.audioUrl,
      mediaType: "audio",
      mimeType: payload.audio.mimeType,
    };
  }
  if (payload.video?.videoUrl) {
    return {
      text: payload.video.caption || null,
      mediaUrl: payload.video.videoUrl,
      mediaType: "video",
      mimeType: payload.video.mimeType,
    };
  }
  if (payload.document?.documentUrl) {
    return {
      text: payload.document.fileName || payload.document.title || null,
      mediaUrl: payload.document.documentUrl,
      mediaType: "document",
      mimeType: payload.document.mimeType,
      fileName: payload.document.fileName,
    };
  }
  return null;
}

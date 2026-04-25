/**
 * Cliente para a WhatsApp Cloud API (oficial da Meta).
 * Cada agente possui suas próprias credenciais armazenadas em `whatsapp_config`.
 *
 * Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

import crypto from "crypto";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export type WaCredentials = {
  phoneNumberId: string;
  accessToken: string;
  appSecret?: string | null;
};

export type WaSendResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
  raw?: unknown;
};

async function callGraphApi(
  creds: WaCredentials,
  payload: Record<string, unknown>
): Promise<WaSendResult> {
  if (!creds.phoneNumberId || !creds.accessToken) {
    return { ok: false, error: "WhatsApp não configurado (faltam phoneNumberId/accessToken)" };
  }
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${creds.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );
    const data = (await res.json()) as {
      messages?: Array<{ id: string }>;
      error?: { message?: string };
    };
    if (!res.ok) {
      return { ok: false, error: data?.error?.message || `HTTP ${res.status}`, raw: data };
    }
    return { ok: true, messageId: data.messages?.[0]?.id, raw: data };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function sendText(
  creds: WaCredentials,
  to: string,
  text: string,
  previewUrl = false
): Promise<WaSendResult> {
  return callGraphApi(creds, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body: text, preview_url: previewUrl },
  });
}

export async function sendImage(
  creds: WaCredentials,
  to: string,
  imageUrl: string,
  caption?: string
): Promise<WaSendResult> {
  return callGraphApi(creds, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "image",
    image: { link: imageUrl, ...(caption ? { caption } : {}) },
  });
}

export async function sendVideo(
  creds: WaCredentials,
  to: string,
  videoUrl: string,
  caption?: string
): Promise<WaSendResult> {
  return callGraphApi(creds, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "video",
    video: { link: videoUrl, ...(caption ? { caption } : {}) },
  });
}

export async function sendDocument(
  creds: WaCredentials,
  to: string,
  documentUrl: string,
  filename?: string,
  caption?: string
): Promise<WaSendResult> {
  return callGraphApi(creds, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "document",
    document: {
      link: documentUrl,
      ...(filename ? { filename } : {}),
      ...(caption ? { caption } : {}),
    },
  });
}

export type TemplateVar = string;

export async function sendTemplate(
  creds: WaCredentials,
  to: string,
  templateName: string,
  languageCode: string,
  bodyVariables: TemplateVar[] = []
): Promise<WaSendResult> {
  const components = bodyVariables.length
    ? [
        {
          type: "body",
          parameters: bodyVariables.map(v => ({ type: "text", text: String(v) })),
        },
      ]
    : [];

  return callGraphApi(creds, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length ? { components } : {}),
    },
  });
}

/**
 * Envia o indicador de "digitando..." para o lead.
 * Na Cloud API isso é feito junto com `messages.markAsRead`,
 * passando `typing_indicator: { type: 'text' }` no payload.
 * O indicador some sozinho após ~25s ou quando enviamos a próxima mensagem.
 */
export async function sendTypingOn(
  creds: WaCredentials,
  waMessageId: string
): Promise<WaSendResult> {
  return callGraphApi(creds, {
    messaging_product: "whatsapp",
    status: "read",
    message_id: waMessageId,
    typing_indicator: { type: "text" },
  });
}

/**
 * Marca uma mensagem como lida (azulzinha).
 */
export async function markAsRead(
  creds: WaCredentials,
  waMessageId: string
): Promise<WaSendResult> {
  return callGraphApi(creds, {
    messaging_product: "whatsapp",
    status: "read",
    message_id: waMessageId,
  });
}

/**
 * Verifica assinatura HMAC SHA-256 do webhook (segurança da Meta).
 */
export function verifyWebhookSignature(
  appSecret: string | null | undefined,
  rawBody: string,
  signatureHeader: string | string[] | undefined
): boolean {
  if (!appSecret || !signatureHeader) return true; // se não configurado, não bloqueia
  const sig = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!sig) return true;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

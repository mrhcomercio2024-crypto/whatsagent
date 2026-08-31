import type { Express, Request, Response } from "express";
import { createHash } from "crypto";
import { verifySignature } from "../external/hmac";
import { normalizePhoneCandidate } from "./service";
import {
  findPublicSessionForPurchase,
  getPublicSimulatorConfigBySlug,
  recordPublicConversion,
  updatePublicSimulatorSession,
} from "./db";
import { recordPurchaseAfterPush } from "./recovery/service";

type AnyObject = Record<string, unknown>;

export function pickPaymentEvent(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "custom";
  const p = payload as AnyObject;
  for (const key of ["event", "eventType", "event_type", "type", "topic"]) {
    const value = p[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 120);
  }
  return "custom";
}

function walkValues(value: unknown, depth = 0): Array<{ key: string; value: unknown }> {
  if (depth > 6 || value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.flatMap(v => walkValues(v, depth + 1));
  }
  if (typeof value !== "object") return [];
  const entries: Array<{ key: string; value: unknown }> = [];
  for (const [key, child] of Object.entries(value as AnyObject)) {
    entries.push({ key: key.toLowerCase(), value: child });
    entries.push(...walkValues(child, depth + 1));
  }
  return entries;
}

export function extractPaymentIdentifiers(payload: unknown) {
  const entries = walkValues(payload);
  const findString = (keys: string[]) => {
    for (const key of keys) {
      const hit = entries.find(
        e => e.key === key && typeof e.value === "string" && e.value.trim(),
      );
      if (hit) return String(hit.value).trim();
    }
    return null;
  };
  const rawPhone = findString(["phone", "telephone", "mobile", "celular", "whatsapp"]);
  const amountValue = entries.find(e =>
    ["amount", "amount_cents", "total", "total_amount", "value"].includes(e.key),
  )?.value;
  const amount = typeof amountValue === "number" ? amountValue : Number(amountValue);
  return {
    publicId: findString([
      "wa_sim_session",
      "simulator_session",
      "publicid",
      "public_id",
      "session_id",
    ]),
    email: findString(["email", "customer_email", "buyer_email"]),
    phone: rawPhone ? normalizePhoneCandidate(rawPhone) : null,
    orderId: findString(["order_id", "orderid", "code", "id"]),
    eventId:
      findString(["webhook_id", "event_id", "eventid"]) ||
      (payload && typeof payload === "object" && typeof (payload as AnyObject).id === "string"
        ? String((payload as AnyObject).id)
        : null),
    currency: findString(["currency", "currency_code"]) || "BRL",
    amountCents: Number.isFinite(amount)
      ? Math.max(0, Math.round(amount as number))
      : null,
  };
}

export function mapPaymentEvent(event: string):
  | "purchase_paid"
  | "purchase_failed"
  | "purchase_refunded"
  | null {
  const normalized = event.toLowerCase();
  if (
    normalized.endsWith(".paid") ||
    normalized === "paid" ||
    normalized.includes("purchase.completed") ||
    normalized.includes("payment.approved")
  ) {
    return "purchase_paid";
  }
  if (
    normalized.includes("payment_failed") ||
    normalized.includes("payment.failed") ||
    normalized.includes("refused") ||
    normalized.includes("declined")
  ) {
    return "purchase_failed";
  }
  if (normalized.includes("refund") || normalized.includes("refunded")) {
    return "purchase_refunded";
  }
  return null;
}

function signatureHeader(req: Request) {
  return (
    req.header("x-signature") ||
    req.header("x-webhook-signature") ||
    req.header("x-hub-signature-256") ||
    null
  );
}

export function registerPublicSimulatorWebhook(app: Express) {
  app.post(
    "/api/public-simulator/:slug/checkout/:secret",
    async (req: Request, res: Response) => {
      const slug = String(req.params.slug || "").toLowerCase().trim();
      const secret = String(req.params.secret || "").trim();
      const config = await getPublicSimulatorConfigBySlug(slug);
      if (!config || !config.enabled || secret !== config.webhookSecret) {
        res.status(404).json({ ok: false });
        return;
      }

      const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
      const signature = signatureHeader(req);
      // O segredo na própria URL é obrigatório. Se o provedor também enviar
      // uma assinatura HMAC, nós a validamos como segunda camada.
      if (signature && !verifySignature(config.webhookSecret, rawBody, signature)) {
        res.status(401).json({ ok: false, error: "invalid signature" });
        return;
      }

      const payload = req.body ?? {};
      const event = pickPaymentEvent(payload);
      const configuredPaidEvents = Array.isArray(config.purchaseEventNames)
        ? config.purchaseEventNames.map(value => String(value).toLowerCase())
        : [];
      const mapped = configuredPaidEvents.includes(event.toLowerCase())
        ? "purchase_paid"
        : mapPaymentEvent(event);
      if (!mapped) {
        res.status(202).json({ ok: true, ignored: true, event });
        return;
      }

      const ids = extractPaymentIdentifiers(payload);
      const session = await findPublicSessionForPurchase(ids);
      if (!session || session.agentId !== config.agentId) {
        res.status(202).json({ ok: true, matched: false, event });
        return;
      }

      const eventId = (
        ids.eventId ||
        `${event}:${ids.orderId || session.publicId}:${createHash("sha256")
          .update(rawBody)
          .digest("hex")
          .slice(0, 24)}`
      ).slice(0, 180);
      const inserted = await recordPublicConversion({
        sessionId: session.id,
        agentId: session.agentId,
        eventId,
        eventType: mapped,
        orderId: ids.orderId,
        amountCents: ids.amountCents,
        currency: ids.currency,
        payload,
      });

      if (inserted) {
        if (mapped === "purchase_paid") {
          await updatePublicSimulatorSession(session.id, {
            status: "converted",
            purchasedAt: new Date(),
            purchaseEventId: eventId,
            orderId: ids.orderId,
            amountCents: ids.amountCents,
            currency: ids.currency,
          });
          await recordPurchaseAfterPush(session.id, ids.amountCents);
        } else if (mapped === "purchase_refunded") {
          await updatePublicSimulatorSession(session.id, { status: "completed" });
        }
      }

      res.status(202).json({
        ok: true,
        matched: true,
        duplicate: !inserted,
        event,
        conversion: mapped,
      });
    },
  );
}

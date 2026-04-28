/**
 * Endpoint público de ingestão de eventos externos.
 *
 *   POST /api/external-events/:slug
 *   Header (opcional): X-Signature: sha256=<hex>
 *   Body: JSON arbitrário
 *
 * Resolve o `external_event_source` pelo slug, valida HMAC se houver
 * secret configurado, persiste o evento e dispara o motor de regras
 * de forma assíncrona (resposta 202 imediata para não fazer a plataforma
 * externa esperar).
 */
import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import {
  externalEventSources,
  externalEvents,
  leads as leadsTable,
} from "../../drizzle/schema";
import { getDb, findOrCreateLead } from "../db";
import { verifySignature } from "./hmac";
import { extractIdentifiers } from "./identify";
import { executeRuleActions, loadRulesFor } from "./engine";
import { and } from "drizzle-orm";

const SIGNATURE_HEADERS = [
  "x-signature",
  "x-hub-signature-256",
  "x-webhook-signature",
  "x-hotmart-hottok",
  "x-shopify-hmac-sha256",
  "stripe-signature",
];

function pickSignatureHeader(req: Request): string | null {
  for (const h of SIGNATURE_HEADERS) {
    const v = req.header(h);
    if (v) return v;
  }
  return null;
}

/** Tenta extrair um eventType da URL (?event=...) ou do payload. */
function pickEventType(req: Request, payload: any): string {
  const fromQuery = String(req.query.event ?? "").trim();
  if (fromQuery) return fromQuery.slice(0, 80);
  const candidates = [
    "event",
    "eventType",
    "event_type",
    "event_name",
    "type",
    "topic",
    "action",
  ];
  if (payload && typeof payload === "object") {
    for (const k of candidates) {
      const v = (payload as any)[k];
      if (typeof v === "string" && v.trim()) return v.trim().slice(0, 80);
    }
  }
  return "custom";
}

/**
 * Resolve um lead existente por telefone OU email, sem criar.
 */
async function lookupExistingLead(
  agentId: number,
  phone: string | null,
  email: string | null
): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  if (phone) {
    const r = await db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(and(eq(leadsTable.agentId, agentId), eq(leadsTable.phoneNumber, phone)))
      .limit(1);
    if (r[0]) return r[0].id;
  }
  if (email) {
    const r = await db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(and(eq(leadsTable.agentId, agentId), eq(leadsTable.email, email)))
      .limit(1);
    if (r[0]) return r[0].id;
  }
  return null;
}

export function registerExternalEventsWebhook(app: Express) {
  // Endpoint principal — POST recebe o webhook
  app.post("/api/external-events/:slug", async (req: Request, res: Response) => {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    if (!slug) {
      res.status(400).json({ ok: false, error: "missing slug" });
      return;
    }

    const db = await getDb();
    if (!db) {
      res.status(503).json({ ok: false, error: "database unavailable" });
      return;
    }

    const sources = await db
      .select()
      .from(externalEventSources)
      .where(eq(externalEventSources.slug, slug))
      .limit(1);
    const source = sources[0];

    if (!source) {
      res.status(404).json({ ok: false, error: "source not found" });
      return;
    }

    // Body já parseado por express.json (limit 50mb).
    // Para HMAC reproduzir a string que o cliente assinou, recompomos:
    const rawBody =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});

    const sigHeader = pickSignatureHeader(req);
    if (source.secret) {
      const ok = verifySignature(source.secret, rawBody, sigHeader);
      if (!ok) {
        res.status(401).json({ ok: false, error: "invalid signature" });
        return;
      }
    }

    if (!source.enabled) {
      // Persiste como ignored para o usuário ver no log
      try {
        await db.insert(externalEvents).values({
          sourceId: source.id,
          agentId: source.agentId,
          eventType: pickEventType(req, req.body),
          payload: req.body ?? {},
          status: "ignored",
          errorMessage: "source desabilitado",
        });
      } catch {
        // ignore
      }
      res.status(202).json({ ok: true, ignored: true });
      return;
    }

    const payload = req.body ?? {};
    const ids = extractIdentifiers(payload);
    const eventType = pickEventType(req, payload);

    // Persiste evento como received
    let eventInsertId: number | null = null;
    try {
      const r: any = await db.insert(externalEvents).values({
        sourceId: source.id,
        agentId: source.agentId,
        eventType,
        leadIdentifier: ids.primary,
        payload,
        status: "received",
      });
      eventInsertId = r?.[0]?.insertId ?? null;
    } catch (e) {
      console.warn("[external] persist failed:", (e as Error).message);
    }

    // Responde 202 IMEDIATAMENTE — processa em background.
    // Plataformas externas têm timeouts curtos (3-10s) e fazem retry agressivo
    // se receberem timeout, então nunca devemos bloquear a resposta.
    res.status(202).json({
      ok: true,
      eventId: eventInsertId,
      eventType,
      identified: ids.primary != null,
    });

    // ---- processamento em background ----
    void (async () => {
      try {
        const rules = await loadRulesFor(source.agentId, eventType, source.id);

        // Caso especial: evento "ping" / "test" — sem regras, registra como ignored
        if (rules.length === 0) {
          if (eventInsertId != null) {
            await db
              .update(externalEvents)
              .set({ status: "ignored", processedAt: new Date(), errorMessage: "nenhuma regra" })
              .where(eq(externalEvents.id, eventInsertId));
          }
          return;
        }

        // Busca lead existente
        let leadId = await lookupExistingLead(source.agentId, ids.phone, ids.email);

        // Se não existir e ALGUMA regra permite criar, cria
        const allowCreate = rules.some((r) => r.createLeadIfMissing);
        if (!leadId && allowCreate && ids.phone) {
          leadId = await findOrCreateLead(
            source.agentId,
            ids.phone,
            ids.name ?? undefined
          );
          // Atualiza email se vier no payload
          if (ids.email) {
            await db
              .update(leadsTable)
              .set({ email: ids.email })
              .where(eq(leadsTable.id, leadId));
          }
        }

        if (!leadId) {
          if (eventInsertId != null) {
            await db
              .update(externalEvents)
              .set({
                status: "unmatched",
                processedAt: new Date(),
                errorMessage: ids.primary
                  ? "lead não encontrado e sem regra que permita criar"
                  : "payload sem telefone/email identificável",
              })
              .where(eq(externalEvents.id, eventInsertId));
          }
          return;
        }

        // Executa todas as regras na ordem de prioridade
        const allApplied: any[] = [];
        let anyError = false;
        for (const rule of rules) {
          try {
            const applied = await executeRuleActions({
              agentId: source.agentId,
              leadId,
              eventType,
              rule,
              payload,
            });
            allApplied.push({ ruleId: rule.id, name: rule.name, applied });
            if (applied.some((a) => !a.ok)) anyError = true;
          } catch (e) {
            anyError = true;
            allApplied.push({ ruleId: rule.id, error: (e as Error).message });
          }
        }

        if (eventInsertId != null) {
          await db
            .update(externalEvents)
            .set({
              status: anyError ? "failed" : "processed",
              leadId,
              actionsApplied: allApplied,
              processedAt: new Date(),
            })
            .where(eq(externalEvents.id, eventInsertId));
        }
      } catch (e) {
        console.warn("[external] background process failed:", (e as Error).message);
        if (eventInsertId != null) {
          try {
            await db
              .update(externalEvents)
              .set({
                status: "failed",
                processedAt: new Date(),
                errorMessage: (e as Error).message.slice(0, 500),
              })
              .where(eq(externalEvents.id, eventInsertId));
          } catch {
            // ignore
          }
        }
      }
    })();
  });

  // Endpoint de health do próprio webhook — útil pra testar URL no painel
  app.get("/api/external-events/:slug/health", async (req: Request, res: Response) => {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    const db = await getDb();
    if (!db) {
      res.status(503).json({ ok: false });
      return;
    }
    const r = await db
      .select({ id: externalEventSources.id, enabled: externalEventSources.enabled })
      .from(externalEventSources)
      .where(eq(externalEventSources.slug, slug))
      .limit(1);
    if (!r[0]) {
      res.status(404).json({ ok: false, error: "source not found" });
      return;
    }
    res.json({ ok: true, enabled: r[0].enabled });
  });
}

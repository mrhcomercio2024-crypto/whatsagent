import { randomUUID } from "crypto";
import { and, desc, eq, inArray, isNull, lte } from "drizzle-orm";
import {
  conversations,
  leads,
  messages,
  publicPushSubscriptions,
  publicSimulatorConfigs,
  publicSimulatorSessions,
  recoveryEvents,
  recoveryJobs,
  recoveryRules,
  type RecoveryJob,
} from "../../../drizzle/schema";
import { getDb } from "../../db";
import { invokeWithModel } from "../../ai/invoke";
import { createPushEventToken, decryptPushSecret } from "../push/crypto";
import { getActiveSubscriptionForSession } from "../push/db";
import { deliverRecovery, getActiveRecoveryChannels, registerRecoveryChannelAdapter } from "./channels";
import { pushRecoveryAdapter } from "../push/channel";

export type RecoveryChannel = "push" | "email" | "instagram" | "whatsapp";
export type CancelRecoveryReason =
  | "lead_returned"
  | "lead_replied"
  | "purchase_approved"
  | "lead_opted_out"
  | "subscription_invalid"
  | "endpoint_permanent_error"
  | "new_sequence"
  | "checkout_started"
  | "rule_ineligible"
  | "cooldown"
  | "sequence_limit";

registerRecoveryChannelAdapter(pushRecoveryAdapter);

function changedOne(result: unknown) {
  return Number((result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0) === 1;
}

function eventId(pushId: string, type: string) {
  return `${pushId}:${type}:${randomUUID()}`.slice(0, 80);
}

function sequenceKey(sessionId: number, lastInboundAt: Date | null) {
  return `${sessionId}:${lastInboundAt?.getTime() || 0}`;
}

async function appendRecoveryEvent(
  job: RecoveryJob,
  eventType: typeof recoveryEvents.$inferInsert.eventType,
  input: { revenueCents?: number | null; payload?: unknown } = {},
) {
  const db = await getDb();
  if (!db) return;
  await db.insert(recoveryEvents).values({
    eventId: eventId(job.pushId, eventType),
    pushId: job.pushId,
    jobId: job.id,
    ruleId: job.ruleId,
    sessionId: job.sessionId,
    agentId: job.agentId,
    channel: job.channel,
    eventType,
    revenueCents: input.revenueCents ?? null,
    attributionWindowHours: job.attributionWindowHours,
    payload: input.payload ?? null,
  });
}

export async function cancelPendingRecoveryJobs(
  sessionId: number,
  reason: CancelRecoveryReason,
) {
  const db = await getDb();
  if (!db) return 0;
  const pending = await db
    .select()
    .from(recoveryJobs)
    .where(
      and(
        eq(recoveryJobs.sessionId, sessionId),
        inArray(recoveryJobs.status, ["pending", "processing"]),
      ),
    );
  if (!pending.length) return 0;
  const now = new Date();
  await db
    .update(recoveryJobs)
    .set({ status: "cancelled", cancelReason: reason, cancelledAt: now, lockedAt: null })
    .where(
      and(
        eq(recoveryJobs.sessionId, sessionId),
        inArray(recoveryJobs.status, ["pending", "processing"]),
      ),
    );
  await Promise.all(pending.map(job => appendRecoveryEvent(job, "cancelled", { payload: { reason } })));
  return pending.length;
}

export async function scheduleRecoverySequence(sessionId: number) {
  const db = await getDb();
  if (!db) return { scheduled: 0, reason: "db_unavailable" };
  const rows = await db
    .select({
      session: publicSimulatorSessions,
      config: publicSimulatorConfigs,
      lead: leads,
      conversation: conversations,
    })
    .from(publicSimulatorSessions)
    .innerJoin(publicSimulatorConfigs, eq(publicSimulatorConfigs.id, publicSimulatorSessions.configId))
    .innerJoin(leads, eq(leads.id, publicSimulatorSessions.leadId))
    .innerJoin(conversations, eq(conversations.id, publicSimulatorSessions.conversationId))
    .where(eq(publicSimulatorSessions.id, sessionId))
    .limit(1);
  const row = rows[0];
  if (!row?.config.pushEnabled) return { scheduled: 0, reason: "push_disabled" };
  if (row.session.purchasedAt) return { scheduled: 0, reason: "purchased" };
  if (row.session.pushOptedOutAt) return { scheduled: 0, reason: "opted_out" };
  const subscription = await getActiveSubscriptionForSession(sessionId);
  if (!subscription) return { scheduled: 0, reason: "no_subscription" };

  await cancelPendingRecoveryJobs(sessionId, "new_sequence");
  const rules = await db
    .select()
    .from(recoveryRules)
    .where(
      and(
        eq(recoveryRules.configId, row.config.id),
        eq(recoveryRules.channel, "push"),
        eq(recoveryRules.isActive, true),
      ),
    );
  const base = row.conversation.lastInboundAt || new Date();
  const key = sequenceKey(sessionId, row.conversation.lastInboundAt);
  let scheduled = 0;
  for (const rule of rules.sort((a, b) => a.sequenceOrder - b.sequenceOrder)) {
    const scheduledAt = new Date(base.getTime() + rule.delayMinutes * 60_000);
    const pushId = randomUUID().replace(/-/g, "");
    const idempotencyKey = `${key}:${rule.id}:${rule.channel}`;
    try {
      const result = await db.insert(recoveryJobs).values({
        pushId,
        idempotencyKey,
        ruleId: rule.id,
        configId: row.config.id,
        agentId: row.config.agentId,
        sessionId,
        leadId: row.session.leadId,
        conversationId: row.session.conversationId,
        subscriptionId: subscription.id,
        channel: rule.channel,
        sequenceKey: key,
        sequenceOrder: rule.sequenceOrder,
        status: "pending",
        scheduledAt,
        attributionWindowHours: rule.attributionWindowHours,
        maxAttempts: rule.maxAttempts,
        payload: { messageTemplate: rule.messageTemplate },
      });
      const id = Number((result as any)[0]?.insertId);
      const [created] = await db.select().from(recoveryJobs).where(eq(recoveryJobs.id, id)).limit(1);
      if (created) await appendRecoveryEvent(created, "queued", { payload: { scheduledAt } });
      scheduled += 1;
    } catch {
      // A chave de idempotência já existe para esta sequência/regra.
    }
  }
  return { scheduled, sequenceKey: key };
}

async function markSubscriptionInvalid(subscriptionId: number, sessionId: number, reason: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(publicPushSubscriptions)
    .set({ active: false, invalidatedAt: new Date(), failureCount: 1 })
    .where(eq(publicPushSubscriptions.id, subscriptionId));
  await cancelPendingRecoveryJobs(
    sessionId,
    reason === "404" || reason === "410" ? "endpoint_permanent_error" : "subscription_invalid",
  );
}

function parseJsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

async function personalizeRecoveryText(row: {
  rule: typeof recoveryRules.$inferSelect;
  config: typeof publicSimulatorConfigs.$inferSelect;
  session: typeof publicSimulatorSessions.$inferSelect;
  lead: typeof leads.$inferSelect;
  conversation: typeof conversations.$inferSelect;
}) {
  if (!row.config.pushAiPersonalizationEnabled || !row.rule.aiPersonalizationEnabled) {
    return row.rule.messageTemplate;
  }
  const db = await getDb();
  if (!db) return row.rule.messageTemplate;
  const history = await db
    .select({ direction: messages.direction, body: messages.body })
    .from(messages)
    .where(eq(messages.conversationId, row.conversation.id))
    .orderBy(desc(messages.createdAt))
    .limit(12);
  const prompt = [
    "Reescreva UMA notificação Web Push curta do Ravi Wedrop para retomar uma conversa comercial.",
    "Regras absolutas: até 180 caracteres; não invente fatos; não mencione dados ausentes; não pressione; sem markdown; sem URL; devolva somente a mensagem.",
    `Template obrigatório como base: ${row.rule.messageTemplate}`,
    row.rule.aiPrompt ? `Orientação adicional: ${row.rule.aiPrompt}` : "",
    `Temperatura: ${row.lead.temperature}`,
    `Fatos estruturados: ${JSON.stringify(row.lead.facts || {})}`,
    `Resumo: ${row.conversation.summary || "sem resumo"}`,
    `Histórico recente: ${JSON.stringify(history.reverse())}`,
  ].filter(Boolean).join("\n");
  try {
    const result = await invokeWithModel({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: "Você escreve microcopy comercial humana e estritamente factual." },
        { role: "user", content: prompt },
      ],
      maxTokens: 120,
      tracking: {
        purpose: "recovery_followup",
        agentId: row.session.agentId,
        conversationId: row.conversation.id,
        leadId: row.lead.id,
      },
    });
    const text = result.text.trim().replace(/^['\"]|['\"]$/g, "").slice(0, 180);
    return text.length >= 20 ? text : row.rule.messageTemplate;
  } catch (error) {
    console.warn("[recovery] personalização IA falhou; usando template fixo", error);
    return row.rule.messageTemplate;
  }
}

async function failJob(job: RecoveryJob, error: string, permanent = false) {
  const db = await getDb();
  if (!db) return;
  const attempts = job.attemptCount + 1;
  const canRetry = !permanent && attempts < job.maxAttempts;
  await db
    .update(recoveryJobs)
    .set({
      status: canRetry ? "pending" : "failed",
      attemptCount: attempts,
      lockedAt: null,
      lastError: error.slice(0, 2000),
      scheduledAt: canRetry ? new Date(Date.now() + 15 * 60_000) : job.scheduledAt,
    })
    .where(eq(recoveryJobs.id, job.id));
  await appendRecoveryEvent(job, "failed", { payload: { error, permanent, canRetry } });
}

async function processPushJob(job: RecoveryJob) {
  const db = await getDb();
  if (!db) return;
  const rows = await db
    .select({
      job: recoveryJobs,
      rule: recoveryRules,
      config: publicSimulatorConfigs,
      session: publicSimulatorSessions,
      lead: leads,
      conversation: conversations,
      subscription: publicPushSubscriptions,
    })
    .from(recoveryJobs)
    .innerJoin(recoveryRules, eq(recoveryRules.id, recoveryJobs.ruleId))
    .innerJoin(publicSimulatorConfigs, eq(publicSimulatorConfigs.id, recoveryJobs.configId))
    .innerJoin(publicSimulatorSessions, eq(publicSimulatorSessions.id, recoveryJobs.sessionId))
    .innerJoin(leads, eq(leads.id, recoveryJobs.leadId))
    .innerJoin(conversations, eq(conversations.id, recoveryJobs.conversationId))
    .leftJoin(publicPushSubscriptions, eq(publicPushSubscriptions.id, recoveryJobs.subscriptionId))
    .where(eq(recoveryJobs.id, job.id))
    .limit(1);
  const row = rows[0];
  if (!row) return failJob(job, "RECOVERY_CONTEXT_NOT_FOUND", true);
  const now = new Date();
  const currentSequence = sequenceKey(row.session.id, row.conversation.lastInboundAt);
  if (currentSequence !== row.job.sequenceKey) {
    await cancelPendingRecoveryJobs(row.session.id, "new_sequence");
    return;
  }
  if (!row.config.pushEnabled || !row.rule.isActive || row.session.purchasedAt || row.session.pushOptedOutAt) {
    await cancelPendingRecoveryJobs(row.session.id, "rule_ineligible");
    return;
  }
  if (row.job.channel === "push" && !row.subscription?.active) {
    await appendRecoveryEvent(row.job, "subscription_invalid");
    await cancelPendingRecoveryJobs(row.session.id, "subscription_invalid");
    return;
  }
  // O lead é considerado online enquanto mantém o heartbeat dos últimos 90s.
  if (row.session.lastSeenAt.getTime() > now.getTime() - 90_000) {
    await db.update(recoveryJobs).set({ status: "pending", lockedAt: null, scheduledAt: new Date(now.getTime() + 2 * 60_000) }).where(eq(recoveryJobs.id, job.id));
    return;
  }
  if (row.lead.temperature && parseJsonStringArray(row.rule.eligibleTemperatures).length) {
    if (!parseJsonStringArray(row.rule.eligibleTemperatures).includes(row.lead.temperature)) {
      await cancelPendingRecoveryJobs(row.session.id, "rule_ineligible");
      return;
    }
  }
  if (row.session.leadScore < row.rule.minLeadScore) {
    await cancelPendingRecoveryJobs(row.session.id, "rule_ineligible");
    return;
  }
  const sentInSequence = await db
    .select({ id: recoveryJobs.id })
    .from(recoveryJobs)
    .where(
      and(
        eq(recoveryJobs.sessionId, row.session.id),
        eq(recoveryJobs.sequenceKey, row.job.sequenceKey),
        eq(recoveryJobs.status, "sent"),
      ),
    );
  if (sentInSequence.length >= row.config.pushMaxPerSequence) {
    await cancelPendingRecoveryJobs(row.session.id, "sequence_limit");
    return;
  }
  const lastSent = await db
    .select({ sentAt: recoveryJobs.sentAt })
    .from(recoveryJobs)
    .where(and(eq(recoveryJobs.sessionId, row.session.id), eq(recoveryJobs.status, "sent")))
    .orderBy(desc(recoveryJobs.sentAt))
    .limit(1);
  const cooldownMs = row.config.pushGlobalCooldownMinutes * 60_000;
  if (lastSent[0]?.sentAt && lastSent[0].sentAt.getTime() + cooldownMs > now.getTime()) {
    await db
      .update(recoveryJobs)
      .set({ status: "pending", lockedAt: null, scheduledAt: new Date(lastSent[0].sentAt.getTime() + cooldownMs) })
      .where(eq(recoveryJobs.id, job.id));
    return;
  }

  try {
    const subscription = row.subscription ? {
      endpoint: decryptPushSecret(row.subscription.endpointCiphertext),
      keys: {
        p256dh: decryptPushSecret(row.subscription.p256dhCiphertext),
        auth: decryptPushSecret(row.subscription.authCiphertext),
      },
    } : undefined;
    const body = await personalizeRecoveryText(row);
    const eventToken = createPushEventToken(row.job.pushId);
    const targetUrl = `/simulador/${row.config.slug}?push_id=${row.job.pushId}`;
    await deliverRecovery({
      channel: row.job.channel,
      title: `${row.config.displayName} • WeDrop`,
      body,
      url: targetUrl,
      pushId: row.job.pushId,
      eventToken,
      pushSubscription: subscription,
    });
    const sentAt = new Date();
    await db
      .update(recoveryJobs)
      .set({
        status: "sent",
        sentAt,
        lockedAt: null,
        attemptCount: row.job.attemptCount + 1,
        attributionExpiresAt: new Date(sentAt.getTime() + row.job.attributionWindowHours * 3_600_000),
      })
      .where(eq(recoveryJobs.id, row.job.id));
    if (row.subscription) {
      await db
        .update(publicPushSubscriptions)
        .set({ lastPushAt: sentAt, failureCount: 0 })
        .where(eq(publicPushSubscriptions.id, row.subscription.id));
    }
    await appendRecoveryEvent(row.job, "sent", { payload: { body, targetUrl } });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.status || 0);
    if (statusCode === 404 || statusCode === 410) {
      await appendRecoveryEvent(row.job, "subscription_invalid", { payload: { statusCode } });
      if (row.subscription) {
        await markSubscriptionInvalid(row.subscription.id, row.session.id, String(statusCode));
      }
      return failJob(row.job, `PUSH_ENDPOINT_${statusCode}`, true);
    }
    await failJob(row.job, String(error?.message || error), statusCode >= 400 && statusCode < 500);
  }
}

export async function processDueRecoveryJobs(limit = 50) {
  const db = await getDb();
  if (!db) return { processed: 0 };
  const due = await db
    .select()
    .from(recoveryJobs)
    .where(
      and(
        eq(recoveryJobs.status, "pending"),
        inArray(recoveryJobs.channel, getActiveRecoveryChannels()),
        lte(recoveryJobs.scheduledAt, new Date()),
      ),
    )
    .orderBy(recoveryJobs.scheduledAt)
    .limit(Math.min(200, Math.max(1, limit)));
  let processed = 0;
  for (const job of due) {
    const claim = await db
      .update(recoveryJobs)
      .set({ status: "processing", lockedAt: new Date() })
      .where(and(eq(recoveryJobs.id, job.id), eq(recoveryJobs.status, "pending")));
    if (Number((claim as any)[0]?.affectedRows || 0) !== 1) continue;
    await processPushJob({ ...job, status: "processing" });
    processed += 1;
  }
  return { processed };
}

async function latestAttributableJob(sessionId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(recoveryJobs)
    .where(and(eq(recoveryJobs.sessionId, sessionId), eq(recoveryJobs.status, "sent")))
    .orderBy(desc(recoveryJobs.sentAt))
    .limit(1);
  const job = rows[0];
  if (!job?.sentAt || !job.attributionExpiresAt || job.attributionExpiresAt.getTime() < Date.now()) return undefined;
  return job;
}

export async function recordReturnAfterPush(sessionId: number, pushId?: string | null) {
  const db = await getDb();
  if (!db) return false;
  const jobs = pushId
    ? await db.select().from(recoveryJobs).where(and(eq(recoveryJobs.sessionId, sessionId), eq(recoveryJobs.pushId, pushId))).limit(1)
    : [];
  const job = jobs[0] || (await latestAttributableJob(sessionId));
  await cancelPendingRecoveryJobs(sessionId, "lead_returned");
  if (!job) return false;
  const now = new Date();
  const changed = await db
    .update(recoveryJobs)
    .set({ returnedAt: now })
    .where(and(eq(recoveryJobs.id, job.id), isNull(recoveryJobs.returnedAt)));
  if (!changedOne(changed)) return false;
  await appendRecoveryEvent(job, "returned");
  return true;
}

export async function recordCheckoutAfterPush(sessionId: number) {
  const db = await getDb();
  if (!db) return false;
  const job = await latestAttributableJob(sessionId);
  if (!job) return false;
  const now = new Date();
  const changed = await db
    .update(recoveryJobs)
    .set({ checkoutAfterPushAt: now })
    .where(and(eq(recoveryJobs.id, job.id), isNull(recoveryJobs.checkoutAfterPushAt)));
  if (!changedOne(changed)) return false;
  await appendRecoveryEvent(job, "checkout_after_push");
  await cancelPendingRecoveryJobs(sessionId, "checkout_started");
  return true;
}

export async function recordPurchaseAfterPush(sessionId: number, revenueCents: number | null) {
  const db = await getDb();
  if (!db) return false;
  const job = await latestAttributableJob(sessionId);
  await cancelPendingRecoveryJobs(sessionId, "purchase_approved");
  if (!job) return false;
  const now = new Date();
  const changed = await db
    .update(recoveryJobs)
    .set({ purchaseAfterPushAt: now, revenueAfterPushCents: revenueCents })
    .where(and(eq(recoveryJobs.id, job.id), isNull(recoveryJobs.purchaseAfterPushAt)));
  if (!changedOne(changed)) return false;
  await appendRecoveryEvent(job, "purchase_after_push", { revenueCents });
  return true;
}

export async function registerBrowserPushEvent(input: {
  pushId: string;
  eventType: "delivered" | "clicked";
}) {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select().from(recoveryJobs).where(eq(recoveryJobs.pushId, input.pushId)).limit(1);
  const job = rows[0];
  if (!job) return false;
  const now = new Date();
  if (input.eventType === "delivered") {
    const changed = await db
      .update(recoveryJobs)
      .set({ deliveredAt: now })
      .where(and(eq(recoveryJobs.id, job.id), isNull(recoveryJobs.deliveredAt)));
    if (!changedOne(changed)) return true;
    await appendRecoveryEvent(job, "delivered");
  }
  if (input.eventType === "clicked") {
    const changed = await db
      .update(recoveryJobs)
      .set({ clickedAt: now })
      .where(and(eq(recoveryJobs.id, job.id), isNull(recoveryJobs.clickedAt)));
    if (!changedOne(changed)) return true;
    await appendRecoveryEvent(job, "clicked");
  }
  return true;
}

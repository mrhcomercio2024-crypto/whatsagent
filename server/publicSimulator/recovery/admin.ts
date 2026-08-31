import { and, desc, eq } from "drizzle-orm";
import {
  publicPushSubscriptions,
  publicSimulatorSessions,
  recoveryJobs,
  recoveryRules,
  type InsertRecoveryRule,
} from "../../../drizzle/schema";
import { getDb } from "../../db";

export async function listRecoveryRules(agentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(recoveryRules)
    .where(eq(recoveryRules.agentId, agentId))
    .orderBy(recoveryRules.channel, recoveryRules.sequenceOrder);
}

export async function createRecoveryRule(input: InsertRecoveryRule) {
  const db = await getDb();
  if (!db) throw new Error("DB_UNAVAILABLE");
  const result = await db.insert(recoveryRules).values(input);
  const id = Number((result as any)[0]?.insertId);
  const rows = await db.select().from(recoveryRules).where(eq(recoveryRules.id, id)).limit(1);
  return rows[0];
}

export async function updateRecoveryRule(
  agentId: number,
  id: number,
  patch: Partial<InsertRecoveryRule>,
) {
  const db = await getDb();
  if (!db) throw new Error("DB_UNAVAILABLE");
  await db
    .update(recoveryRules)
    .set(patch)
    .where(and(eq(recoveryRules.agentId, agentId), eq(recoveryRules.id, id)));
  const rows = await db
    .select()
    .from(recoveryRules)
    .where(and(eq(recoveryRules.agentId, agentId), eq(recoveryRules.id, id)))
    .limit(1);
  return rows[0];
}

export async function listRecoveryJobs(agentId: number, limit = 200) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      job: recoveryJobs,
      ruleName: recoveryRules.name,
      ruleDelayMinutes: recoveryRules.delayMinutes,
      visitorPublicId: publicSimulatorSessions.publicId,
      visitorName: publicSimulatorSessions.capturedName,
    })
    .from(recoveryJobs)
    .innerJoin(recoveryRules, eq(recoveryRules.id, recoveryJobs.ruleId))
    .innerJoin(publicSimulatorSessions, eq(publicSimulatorSessions.id, recoveryJobs.sessionId))
    .where(eq(recoveryJobs.agentId, agentId))
    .orderBy(desc(recoveryJobs.createdAt))
    .limit(Math.min(500, Math.max(1, limit)));
}

export async function listPushSubscriptionSummary(agentId: number, limit = 200) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: publicPushSubscriptions.id,
      active: publicPushSubscriptions.active,
      permissionStatus: publicPushSubscriptions.permissionStatus,
      browser: publicPushSubscriptions.browser,
      device: publicPushSubscriptions.device,
      failureCount: publicPushSubscriptions.failureCount,
      lastPushAt: publicPushSubscriptions.lastPushAt,
      invalidatedAt: publicPushSubscriptions.invalidatedAt,
      revokedAt: publicPushSubscriptions.revokedAt,
      createdAt: publicPushSubscriptions.createdAt,
      visitorPublicId: publicSimulatorSessions.publicId,
      visitorName: publicSimulatorSessions.capturedName,
    })
    .from(publicPushSubscriptions)
    .innerJoin(publicSimulatorSessions, eq(publicSimulatorSessions.id, publicPushSubscriptions.sessionId))
    .where(eq(publicPushSubscriptions.agentId, agentId))
    .orderBy(desc(publicPushSubscriptions.createdAt))
    .limit(Math.min(500, Math.max(1, limit)));
}

export async function getRecoveryDashboard(agentId: number) {
  const db = await getDb();
  if (!db) return null;
  const [rules, jobs, subscriptions] = await Promise.all([
    listRecoveryRules(agentId),
    db.select().from(recoveryJobs).where(eq(recoveryJobs.agentId, agentId)).limit(10_000),
    db
      .select({ active: publicPushSubscriptions.active })
      .from(publicPushSubscriptions)
      .where(eq(publicPushSubscriptions.agentId, agentId))
      .limit(10_000),
  ]);
  const byRule = rules.map(rule => {
    const related = jobs.filter(job => job.ruleId === rule.id);
    return {
      ruleId: rule.id,
      name: rule.name,
      channel: rule.channel,
      sequenceOrder: rule.sequenceOrder,
      delayMinutes: rule.delayMinutes,
      queued: related.length,
      sent: related.filter(job => Boolean(job.sentAt)).length,
      delivered: related.filter(job => Boolean(job.deliveredAt)).length,
      clicked: related.filter(job => Boolean(job.clickedAt)).length,
      returned: related.filter(job => Boolean(job.returnedAt)).length,
      checkout: related.filter(job => Boolean(job.checkoutAfterPushAt)).length,
      purchases: related.filter(job => Boolean(job.purchaseAfterPushAt)).length,
      revenueCents: related.reduce((total, job) => total + (job.revenueAfterPushCents || 0), 0),
    };
  });
  const statusCounts = jobs.reduce<Record<string, number>>((acc, job) => {
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {});
  return {
    totals: {
      queued: jobs.length,
      sent: jobs.filter(job => Boolean(job.sentAt)).length,
      delivered: jobs.filter(job => Boolean(job.deliveredAt)).length,
      clicked: jobs.filter(job => Boolean(job.clickedAt)).length,
      returned: jobs.filter(job => Boolean(job.returnedAt)).length,
      checkout: jobs.filter(job => Boolean(job.checkoutAfterPushAt)).length,
      purchases: jobs.filter(job => Boolean(job.purchaseAfterPushAt)).length,
      revenueCents: jobs.reduce((total, job) => total + (job.revenueAfterPushCents || 0), 0),
      activeSubscriptions: subscriptions.filter(item => item.active).length,
      inactiveSubscriptions: subscriptions.filter(item => !item.active).length,
    },
    statusCounts,
    byRule,
  };
}

import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  agentBrain,
  agents,
  businessHours,
  conversations,
  followupJobs,
  followupRules,
  handoffKeywords,
  InsertConversation,
  InsertLead,
  InsertMessage,
  InsertUser,
  knowledgeBase,
  leads,
  mediaAssets,
  mediaTriggers,
  messages,
  metricsEvents,
  scriptSteps,
  users,
  whatsappConfig,
  whatsappTemplates,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/* ============================================================
 * USERS (template default)
 * ============================================================ */
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const f of ["name", "email", "loginMethod"] as const) {
    const v = user[f];
    if (v !== undefined) {
      values[f] = v ?? null;
      updateSet[f] = v ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return r[0];
}

/* ============================================================
 * AGENTS
 * ============================================================ */
export async function listAgents() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(agents).orderBy(desc(agents.updatedAt));
}

export async function getAgentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  return r[0];
}

export async function createAgent(input: typeof agents.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const r = await db.insert(agents).values(input);
  const id = (r as any)[0]?.insertId as number;
  return id;
}

export async function updateAgent(id: number, patch: Partial<typeof agents.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(agents).set(patch).where(eq(agents.id, id));
}

export async function deleteAgent(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Limpar dependências em cascata manual
  await db.delete(agentBrain).where(eq(agentBrain.agentId, id));
  await db.delete(scriptSteps).where(eq(scriptSteps.agentId, id));
  await db.delete(knowledgeBase).where(eq(knowledgeBase.agentId, id));
  await db.delete(mediaAssets).where(eq(mediaAssets.agentId, id));
  await db.delete(mediaTriggers).where(eq(mediaTriggers.agentId, id));
  await db.delete(whatsappConfig).where(eq(whatsappConfig.agentId, id));
  await db.delete(whatsappTemplates).where(eq(whatsappTemplates.agentId, id));
  await db.delete(handoffKeywords).where(eq(handoffKeywords.agentId, id));
  await db.delete(businessHours).where(eq(businessHours.agentId, id));
  await db.delete(followupRules).where(eq(followupRules.agentId, id));
  // conversas/messages/leads ficam para histórico
  await db.delete(agents).where(eq(agents.id, id));
}

/* ============================================================
 * AGENT BRAIN
 * ============================================================ */
export async function getBrainByAgent(agentId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(agentBrain).where(eq(agentBrain.agentId, agentId)).limit(1);
  return r[0];
}

export async function upsertBrain(input: typeof agentBrain.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await getBrainByAgent(input.agentId);
  if (existing) {
    await db.update(agentBrain).set(input).where(eq(agentBrain.agentId, input.agentId));
  } else {
    await db.insert(agentBrain).values(input);
  }
}

/* ============================================================
 * SCRIPT STEPS
 * ============================================================ */
export async function listSteps(agentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(scriptSteps)
    .where(eq(scriptSteps.agentId, agentId))
    .orderBy(asc(scriptSteps.orderIndex));
}

export async function createStep(input: typeof scriptSteps.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const r = await db.insert(scriptSteps).values(input);
  return (r as any)[0]?.insertId as number;
}

export async function updateStep(id: number, patch: Partial<typeof scriptSteps.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(scriptSteps).set(patch).where(eq(scriptSteps.id, id));
}

export async function deleteStep(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(scriptSteps).where(eq(scriptSteps.id, id));
}

export async function getStepById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(scriptSteps).where(eq(scriptSteps.id, id)).limit(1);
  return r[0];
}

/* ============================================================
 * KNOWLEDGE BASE
 * ============================================================ */
export async function listKnowledge(agentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(knowledgeBase)
    .where(eq(knowledgeBase.agentId, agentId))
    .orderBy(desc(knowledgeBase.updatedAt));
}

export async function createKnowledge(input: typeof knowledgeBase.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const r = await db.insert(knowledgeBase).values(input);
  return (r as any)[0]?.insertId as number;
}

export async function updateKnowledge(id: number, patch: Partial<typeof knowledgeBase.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(knowledgeBase).set(patch).where(eq(knowledgeBase.id, id));
}

export async function deleteKnowledge(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(knowledgeBase).where(eq(knowledgeBase.id, id));
}

/* ============================================================
 * MEDIA
 * ============================================================ */
export async function listMedia(agentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.agentId, agentId))
    .orderBy(desc(mediaAssets.createdAt));
}

export async function getMediaById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
  return r[0];
}

export async function createMedia(input: typeof mediaAssets.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const r = await db.insert(mediaAssets).values(input);
  return (r as any)[0]?.insertId as number;
}

export async function deleteMedia(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(mediaTriggers).where(eq(mediaTriggers.mediaId, id));
  await db.delete(mediaAssets).where(eq(mediaAssets.id, id));
}

export async function listTriggers(agentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(mediaTriggers)
    .where(eq(mediaTriggers.agentId, agentId))
    .orderBy(desc(mediaTriggers.createdAt));
}

export async function createTrigger(input: typeof mediaTriggers.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const r = await db.insert(mediaTriggers).values(input);
  return (r as any)[0]?.insertId as number;
}

export async function updateTrigger(id: number, patch: Partial<typeof mediaTriggers.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(mediaTriggers).set(patch).where(eq(mediaTriggers.id, id));
}

export async function deleteTrigger(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(mediaTriggers).where(eq(mediaTriggers.id, id));
}

/* ============================================================
 * WHATSAPP CONFIG / TEMPLATES
 * ============================================================ */
export async function getWhatsappConfig(agentId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db
    .select()
    .from(whatsappConfig)
    .where(eq(whatsappConfig.agentId, agentId))
    .limit(1);
  return r[0];
}

export async function upsertWhatsappConfig(input: typeof whatsappConfig.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const ex = await getWhatsappConfig(input.agentId);
  if (ex) {
    await db
      .update(whatsappConfig)
      .set(input)
      .where(eq(whatsappConfig.agentId, input.agentId));
  } else {
    await db.insert(whatsappConfig).values(input);
  }
}

export async function getAgentByPhoneNumberId(phoneNumberId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db
    .select()
    .from(whatsappConfig)
    .where(eq(whatsappConfig.phoneNumberId, phoneNumberId))
    .limit(1);
  if (!r[0]) return undefined;
  return getAgentById(r[0].agentId);
}

export async function listTemplates(agentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(whatsappTemplates)
    .where(eq(whatsappTemplates.agentId, agentId))
    .orderBy(desc(whatsappTemplates.createdAt));
}

export async function createTemplate(input: typeof whatsappTemplates.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const r = await db.insert(whatsappTemplates).values(input);
  return (r as any)[0]?.insertId as number;
}

export async function deleteTemplate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(whatsappTemplates).where(eq(whatsappTemplates.id, id));
}

export async function getTemplateById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db
    .select()
    .from(whatsappTemplates)
    .where(eq(whatsappTemplates.id, id))
    .limit(1);
  return r[0];
}

/* ============================================================
 * LEADS / CONVERSATIONS / MESSAGES
 * ============================================================ */
export async function findOrCreateLead(
  agentId: number,
  phoneNumber: string,
  name?: string
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db
    .select()
    .from(leads)
    .where(and(eq(leads.agentId, agentId), eq(leads.phoneNumber, phoneNumber)))
    .limit(1);
  if (existing[0]) {
    if (name && !existing[0].name) {
      await db.update(leads).set({ name }).where(eq(leads.id, existing[0].id));
    }
    return existing[0].id;
  }
  const r = await db.insert(leads).values({
    agentId,
    phoneNumber,
    name: name ?? null,
  } satisfies InsertLead);
  return (r as any)[0]?.insertId as number;
}

export async function getLeadById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  return r[0];
}

export async function updateLead(id: number, patch: Partial<typeof leads.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(leads).set(patch).where(eq(leads.id, id));
}

export async function listLeads(agentId: number, opts?: { limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(leads)
    .where(eq(leads.agentId, agentId))
    .orderBy(desc(leads.updatedAt))
    .limit(opts?.limit ?? 500);
}

export async function findOrCreateConversation(
  agentId: number,
  leadId: number
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.agentId, agentId), eq(conversations.leadId, leadId)))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const r = await db.insert(conversations).values({
    agentId,
    leadId,
  } satisfies InsertConversation);
  return (r as any)[0]?.insertId as number;
}

export async function getConversationById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  return r[0];
}

export async function updateConversation(
  id: number,
  patch: Partial<typeof conversations.$inferInsert>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(conversations).set(patch).where(eq(conversations.id, id));
}

export async function listConversations(
  agentId: number,
  opts?: { status?: string; limit?: number }
) {
  const db = await getDb();
  if (!db) return [];
  const conds = [eq(conversations.agentId, agentId)];
  if (opts?.status) conds.push(eq(conversations.status, opts.status as any));
  return db
    .select()
    .from(conversations)
    .where(and(...conds))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(opts?.limit ?? 200);
}

export async function listConversationsWithLeads(
  agentId: number,
  opts?: { limit?: number }
) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      conv: conversations,
      lead: leads,
    })
    .from(conversations)
    .innerJoin(leads, eq(leads.id, conversations.leadId))
    .where(eq(conversations.agentId, agentId))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(opts?.limit ?? 200);
}

export async function appendMessage(input: InsertMessage) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const now = new Date();
  const r = await db.insert(messages).values(input);
  const updates: Partial<typeof conversations.$inferInsert> = {
    lastMessageAt: now,
  };
  if (input.direction === "inbound") updates.lastInboundAt = now;
  else updates.lastOutboundAt = now;
  await db
    .update(conversations)
    .set(updates)
    .where(eq(conversations.id, input.conversationId));
  return (r as any)[0]?.insertId as number;
}

export async function listMessages(conversationId: number, opts?: { limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
    .limit(opts?.limit ?? 1000);
}

/* ============================================================
 * BUSINESS HOURS / HANDOFF
 * ============================================================ */
export async function getBusinessHours(agentId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db
    .select()
    .from(businessHours)
    .where(eq(businessHours.agentId, agentId))
    .limit(1);
  return r[0];
}

export async function upsertBusinessHours(input: typeof businessHours.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const ex = await getBusinessHours(input.agentId);
  if (ex) {
    await db.update(businessHours).set(input).where(eq(businessHours.agentId, input.agentId));
  } else {
    await db.insert(businessHours).values(input);
  }
}

export async function listHandoffKeywords(agentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(handoffKeywords)
    .where(eq(handoffKeywords.agentId, agentId));
}

export async function createHandoffKeyword(input: typeof handoffKeywords.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const r = await db.insert(handoffKeywords).values(input);
  return (r as any)[0]?.insertId as number;
}

export async function deleteHandoffKeyword(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(handoffKeywords).where(eq(handoffKeywords.id, id));
}

/* ============================================================
 * FOLLOWUPS
 * ============================================================ */
export async function listFollowupRules(agentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(followupRules)
    .where(eq(followupRules.agentId, agentId))
    .orderBy(asc(followupRules.orderIndex));
}

export async function createFollowupRule(input: typeof followupRules.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const r = await db.insert(followupRules).values(input);
  return (r as any)[0]?.insertId as number;
}

export async function updateFollowupRule(id: number, patch: Partial<typeof followupRules.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(followupRules).set(patch).where(eq(followupRules.id, id));
}

export async function deleteFollowupRule(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(followupRules).where(eq(followupRules.id, id));
}

export async function getFollowupRuleById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(followupRules).where(eq(followupRules.id, id)).limit(1);
  return r[0];
}

export async function scheduleFollowupJobs(
  agentId: number,
  conversationId: number,
  baseTime: Date
) {
  const db = await getDb();
  if (!db) return;
  const rules = await db
    .select()
    .from(followupRules)
    .where(and(eq(followupRules.agentId, agentId), eq(followupRules.isActive, true)))
    .orderBy(asc(followupRules.orderIndex));
  for (const rule of rules) {
    const scheduledAt = new Date(baseTime.getTime() + rule.delayMinutes * 60_000);
    await db.insert(followupJobs).values({
      agentId,
      conversationId,
      ruleId: rule.id,
      scheduledAt,
    });
  }
}

export async function cancelPendingJobsForConversation(conversationId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(followupJobs)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(followupJobs.conversationId, conversationId),
        eq(followupJobs.status, "pending")
      )
    );
}

export async function listDuePendingJobs(now: Date, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(followupJobs)
    .where(and(eq(followupJobs.status, "pending"), lt(followupJobs.scheduledAt, now)))
    .orderBy(asc(followupJobs.scheduledAt))
    .limit(limit);
}

export async function markJobSent(id: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(followupJobs)
    .set({ status: "sent", sentAt: new Date() })
    .where(eq(followupJobs.id, id));
}

export async function markJobFailed(id: number, message: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(followupJobs)
    .set({ status: "failed", errorMessage: message, attemptCount: sql`${followupJobs.attemptCount} + 1` })
    .where(eq(followupJobs.id, id));
}

export async function listFollowupJobs(agentId: number, opts?: { limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(followupJobs)
    .where(eq(followupJobs.agentId, agentId))
    .orderBy(desc(followupJobs.scheduledAt))
    .limit(opts?.limit ?? 200);
}

/* ============================================================
 * METRICS
 * ============================================================ */
export async function recordMetric(input: typeof metricsEvents.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(metricsEvents).values(input);
  } catch (e) {
    console.warn("[metrics] failed:", (e as Error).message);
  }
}

export async function getMetricsSummary(agentId: number, daysBack = 30) {
  const db = await getDb();
  if (!db) return null;
  const since = new Date(Date.now() - daysBack * 86400_000);
  const events = await db
    .select()
    .from(metricsEvents)
    .where(and(eq(metricsEvents.agentId, agentId), gt(metricsEvents.createdAt, since)));
  const counts: Record<string, number> = {};
  let responseTimeSum = 0;
  let responseTimeCount = 0;
  for (const ev of events) {
    counts[ev.eventType] = (counts[ev.eventType] ?? 0) + 1;
    if (ev.eventType === "response_time_ms" && ev.valueNumber) {
      responseTimeSum += ev.valueNumber;
      responseTimeCount += 1;
    }
  }
  const leadsRows = await db.select().from(leads).where(eq(leads.agentId, agentId));
  const tempCounts = { hot: 0, warm: 0, cold: 0, unknown: 0 };
  for (const l of leadsRows) tempCounts[l.temperature] += 1;
  const totalConvs = await db.select().from(conversations).where(eq(conversations.agentId, agentId));
  return {
    totalConversations: totalConvs.length,
    totalLeads: leadsRows.length,
    counts,
    avgResponseTimeMs: responseTimeCount ? Math.round(responseTimeSum / responseTimeCount) : 0,
    temperatures: tempCounts,
  };
}

/* ============================================================
 * EXPORTS auxiliares
 * ============================================================ */
export {
  agentBrain,
  agents,
  businessHours,
  conversations,
  followupJobs,
  followupRules,
  handoffKeywords,
  knowledgeBase,
  leads,
  mediaAssets,
  mediaTriggers,
  messages,
  metricsEvents,
  scriptSteps,
  whatsappConfig,
  whatsappTemplates,
};

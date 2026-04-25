import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
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
  qrSessions,
  llmPrices,
  llmUsage,
  costExtras,
  restrictedTerms,
  type RestrictedTerm,
  type InsertRestrictedTerm,
  type LlmPrice,
  type LlmUsage,
  type CostExtra,
  type InsertLlmPrice,
  type InsertLlmUsage,
  type InsertCostExtra,
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
  try {
    const { publish } = await import("./realtime/bus");
    publish({ type: "status", conversationId: id, patch });
  } catch {
    // ignored
  }
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
  const insertId = (r as any)[0]?.insertId as number;
  const updates: Partial<typeof conversations.$inferInsert> = {
    lastMessageAt: now,
  };
  if (input.direction === "inbound") updates.lastInboundAt = now;
  else updates.lastOutboundAt = now;
  await db
    .update(conversations)
    .set(updates)
    .where(eq(conversations.id, input.conversationId));

  // Realtime: emite no bus para qualquer SSE conectado nesta conversa.
  // Carregado dinamicamente para evitar ciclo (db <-> realtime).
  try {
    const { publish } = await import("./realtime/bus");
    publish({
      type: "message",
      conversationId: input.conversationId,
      message: { id: insertId, ...input, createdAt: now },
    });
  } catch {
    // se o módulo ainda não estiver disponível (ex: testes), apenas ignora
  }

  return insertId;
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
  qrSessions,
};

/* ============================================================
 * QR SESSIONS (Baileys) — modo não oficial
 * ============================================================ */
export async function getQrSession(agentId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(qrSessions).where(eq(qrSessions.agentId, agentId)).limit(1);
  return r[0];
}

export async function upsertQrSession(
  agentId: number,
  patch: Partial<typeof qrSessions.$inferInsert>
) {
  const db = await getDb();
  if (!db) return;
  const existing = await getQrSession(agentId);
  if (existing) {
    await db.update(qrSessions).set(patch).where(eq(qrSessions.agentId, agentId));
  } else {
    await db.insert(qrSessions).values({ agentId, ...patch });
  }
}

export async function deleteQrSession(agentId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(qrSessions).where(eq(qrSessions.agentId, agentId));
}

/**
 * Lista sessões QR que estavam conectadas (para religar no boot do servidor).
 */
export async function listReconnectableQrSessions() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(qrSessions)
    .where(
      and(
        isNotNull(qrSessions.authDir),
        // tudo menos logged_out e banned
        or(
          eq(qrSessions.status, "connected"),
          eq(qrSessions.status, "awaiting_qr"),
          eq(qrSessions.status, "connecting"),
          eq(qrSessions.status, "disconnected")
        )
      )
    );
}

export async function getAgentByJid(jid: string) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db
    .select({ agent: agents })
    .from(qrSessions)
    .innerJoin(agents, eq(qrSessions.agentId, agents.id))
    .where(eq(qrSessions.jid, jid))
    .limit(1);
  return r[0]?.agent;
}


/* ============================================================
 * DEBOUNCE / COALESCING DE MENSAGENS
 * ============================================================ */

/**
 * Marca a conversa para ser processada em `pendingProcessAt`.
 * Cada nova mensagem do lead empurra esse timestamp para frente,
 * fazendo com que o bot espere até o lead "parar de digitar".
 */
export async function setConversationPendingProcessAt(
  conversationId: number,
  at: Date | null
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(conversations)
    .set({ pendingProcessAt: at })
    .where(eq(conversations.id, conversationId));
}

/**
 * Lista conversas cujo debounce já venceu (prontas para processar).
 */
export async function listConversationsDueForProcessing(now: Date, limit = 25) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(conversations)
    .where(
      and(
        isNotNull(conversations.pendingProcessAt),
        lt(conversations.pendingProcessAt, now)
      )
    )
    .limit(limit);
}

/**
 * Concatena as últimas N mensagens inbound do lead (para passar
 * ao orquestrador como um único turno).
 */
export async function concatRecentInbound(
  conversationId: number,
  sinceMs = 5 * 60_000
) {
  const db = await getDb();
  if (!db) return "";
  const since = new Date(Date.now() - sinceMs);
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.direction, "inbound"),
        gt(messages.createdAt, since)
      )
    )
    .orderBy(asc(messages.createdAt));
  return rows
    .map(r => (r.body || "").trim())
    .filter(Boolean)
    .join("\n");
}


/* ============================================================
 * LLM PRICES — preços editáveis por modelo
 * ============================================================ */
// (sql/and/eq/desc/inArray já importados no topo do arquivo)

export async function listLlmPrices(): Promise<LlmPrice[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(llmPrices);
}

export async function getLlmPrice(model: string): Promise<LlmPrice | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(llmPrices).where(eq(llmPrices.model, model)).limit(1);
  return rows[0];
}

export async function upsertLlmPrice(input: InsertLlmPrice): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(llmPrices)
    .values(input)
    .onDuplicateKeyUpdate({
      set: {
        inputPer1M: input.inputPer1M,
        outputPer1M: input.outputPer1M,
        notes: input.notes ?? null,
      },
    });
}

export async function seedLlmPricesIfEmpty(rows: InsertLlmPrice[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select({ id: llmPrices.id }).from(llmPrices).limit(1);
  if (existing.length > 0) return;
  if (rows.length === 0) return;
  await db.insert(llmPrices).values(rows);
}

/* ============================================================
 * LLM USAGE — uma linha por chamada
 * ============================================================ */
export async function recordLlmUsage(input: InsertLlmUsage): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(llmUsage).values(input);
}

export type CostsSummary = {
  totalMicroUsd: number;
  totalCalls: number;
  totalTokens: number;
  totalLeads: number;
  avgPerLeadMicroUsd: number;
  topModel: { model: string; micro: number; calls: number } | null;
  byModel: Array<{
    model: string;
    calls: number;
    tokens: number;
    micro: number;
  }>;
  byDay: Array<{ date: string; micro: number; calls: number }>;
  availableModels: string[]; // todos os modelos já usados no período (para popular o filtro)
};

export async function getCostsSummary(opts: {
  agentId?: number;
  daysBack: number;
  model?: string;
}): Promise<CostsSummary> {
  const db = await getDb();
  const empty: CostsSummary = {
    totalMicroUsd: 0,
    totalCalls: 0,
    totalTokens: 0,
    totalLeads: 0,
    avgPerLeadMicroUsd: 0,
    topModel: null,
    byModel: [],
    byDay: [],
    availableModels: [],
  };
  if (!db) return empty;

  const since = new Date(Date.now() - opts.daysBack * 24 * 60 * 60 * 1000);
  // Para a lista de modelos disponíveis no filtro, ignoramos o filtro de modelo.
  const baseWhere: any[] = [sql`${llmUsage.createdAt} >= ${since}`];
  if (opts.agentId) baseWhere.push(eq(llmUsage.agentId, opts.agentId));
  const baseCond = baseWhere.length > 1 ? and(...baseWhere) : baseWhere[0];
  const allRowsForModels = await db
    .select({ model: llmUsage.model })
    .from(llmUsage)
    .where(baseCond);
  const availableModels = Array.from(new Set(allRowsForModels.map(r => r.model))).sort();

  const where: any[] = [...baseWhere];
  if (opts.model) where.push(eq(llmUsage.model, opts.model));
  const cond = where.length > 1 ? and(...where) : where[0];

  const rows = await db.select().from(llmUsage).where(cond);
  const totalMicroUsd = rows.reduce((a, r) => a + (r.costMicroUsd ?? 0), 0);
  const totalCalls = rows.length;
  const totalTokens = rows.reduce((a, r) => a + (r.totalTokens ?? 0), 0);
  const leadsSet = new Set<number>();
  rows.forEach(r => r.leadId && leadsSet.add(r.leadId));
  const totalLeads = leadsSet.size;
  const avgPerLeadMicroUsd = totalLeads > 0 ? Math.round(totalMicroUsd / totalLeads) : 0;

  const byModelMap = new Map<string, { calls: number; tokens: number; micro: number }>();
  for (const r of rows) {
    const k = r.model;
    const cur = byModelMap.get(k) || { calls: 0, tokens: 0, micro: 0 };
    cur.calls++;
    cur.tokens += r.totalTokens ?? 0;
    cur.micro += r.costMicroUsd ?? 0;
    byModelMap.set(k, cur);
  }
  const byModel = Array.from(byModelMap.entries())
    .map(([model, v]) => ({ model, ...v }))
    .sort((a, b) => b.micro - a.micro);
  const topModel = byModel.length > 0
    ? { model: byModel[0].model, micro: byModel[0].micro, calls: byModel[0].calls }
    : null;

  const byDayMap = new Map<string, { micro: number; calls: number }>();
  for (const r of rows) {
    const d = new Date(r.createdAt!);
    const key = d.toISOString().slice(0, 10);
    const cur = byDayMap.get(key) || { micro: 0, calls: 0 };
    cur.micro += r.costMicroUsd ?? 0;
    cur.calls++;
    byDayMap.set(key, cur);
  }
  const byDay = Array.from(byDayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalMicroUsd,
    totalCalls,
    totalTokens,
    totalLeads,
    avgPerLeadMicroUsd,
    topModel,
    byModel,
    byDay,
    availableModels,
  };
}

export type LeadCostRow = {
  leadId: number;
  leadName: string | null;
  phone: string;
  micro: number;
  tokens: number;
  calls: number;
  lastUsedAt: Date | null;
};

export type LeadCostsPage = {
  rows: LeadCostRow[];
  total: number;
};

export async function getCostsByLead(opts: {
  agentId?: number;
  daysBack: number;
  limit?: number;
  offset?: number;
  model?: string;
}): Promise<LeadCostsPage> {
  const db = await getDb();
  if (!db) return { rows: [], total: 0 };
  const since = new Date(Date.now() - opts.daysBack * 24 * 60 * 60 * 1000);
  const where: any[] = [sql`${llmUsage.createdAt} >= ${since}`];
  if (opts.agentId) where.push(eq(llmUsage.agentId, opts.agentId));
  if (opts.model) where.push(eq(llmUsage.model, opts.model));
  const cond = where.length > 1 ? and(...where) : where[0];

  const rows = await db.select().from(llmUsage).where(cond);
  const map = new Map<number, LeadCostRow>();
  for (const r of rows) {
    if (!r.leadId) continue;
    const cur = map.get(r.leadId) || {
      leadId: r.leadId,
      leadName: null,
      phone: "",
      micro: 0,
      tokens: 0,
      calls: 0,
      lastUsedAt: null,
    };
    cur.micro += r.costMicroUsd ?? 0;
    cur.tokens += r.totalTokens ?? 0;
    cur.calls++;
    const d = r.createdAt ? new Date(r.createdAt) : null;
    if (d && (!cur.lastUsedAt || d > cur.lastUsedAt)) cur.lastUsedAt = d;
    map.set(r.leadId, cur);
  }
  if (map.size === 0) return { rows: [], total: 0 };

  const ids = Array.from(map.keys());
  const leadRows = await db.select().from(leads).where(inArray(leads.id, ids));
  for (const l of leadRows) {
    const c = map.get(l.id)!;
    c.leadName = l.name;
    c.phone = l.phoneNumber;
  }
  const all = Array.from(map.values()).sort((a, b) => b.micro - a.micro);
  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? 25;
  return {
    rows: all.slice(offset, offset + limit),
    total: all.length,
  };
}

/* ============================================================
 * COST EXTRAS — outras taxas operacionais (manuais)
 * ============================================================ */
export async function listCostExtras(opts: {
  agentId?: number;
}): Promise<CostExtra[]> {
  const db = await getDb();
  if (!db) return [];
  if (opts.agentId === undefined) {
    return await db.select().from(costExtras).orderBy(desc(costExtras.occurredOn));
  }
  return await db
    .select()
    .from(costExtras)
    .where(eq(costExtras.agentId, opts.agentId))
    .orderBy(desc(costExtras.occurredOn));
}

export async function addCostExtra(input: InsertCostExtra): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(costExtras).values(input);
}

export async function deleteCostExtra(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(costExtras).where(eq(costExtras.id, id));
}


/* ============================================================
 * RESTRICTED TERMS — termos proibidos por agente
 * ============================================================ */
export async function listRestrictedTerms(agentId: number): Promise<RestrictedTerm[]> {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(restrictedTerms)
    .where(eq(restrictedTerms.agentId, agentId))
    .orderBy(desc(restrictedTerms.createdAt));
}

export async function addRestrictedTerm(input: InsertRestrictedTerm): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(restrictedTerms).values(input);
}

export async function deleteRestrictedTerm(id: number, agentId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(restrictedTerms)
    .where(and(eq(restrictedTerms.id, id), eq(restrictedTerms.agentId, agentId)));
}

/* ============================================================
 * SCRIPT STEP — literal mode update
 * ============================================================ */
export async function updateStepLiteralMode(
  stepId: number,
  literalMode: boolean,
  literalText: string | null
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(scriptSteps)
    .set({ literalMode, literalText })
    .where(eq(scriptSteps.id, stepId));
}

/* ============================================================
 * RESET DE CONVERSA (comando interno /limpar)
 * ============================================================ */

/**
 * Apaga todas as mensagens da conversa, zera summary, currentStep,
 * pendingProcessAt, sentMediaIds e cancela jobs de followup pendentes.
 * Mantém a conversa (mesmo id), apenas como se nunca tivesse acontecido.
 */
export async function resetConversation(conversationId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Apaga todas as mensagens
  await db.delete(messages).where(eq(messages.conversationId, conversationId));

  // Cancela follow-ups pendentes
  await cancelPendingJobsForConversation(conversationId);

  // Reseta a conversa para o estado inicial.
  // Volta o currentStepId para a primeira etapa do agente, se existir.
  const conv = await getConversationById(conversationId);
  let firstStepId: number | null = null;
  if (conv) {
    const stepsList = await db
      .select()
      .from(scriptSteps)
      .where(eq(scriptSteps.agentId, conv.agentId))
      .orderBy(asc(scriptSteps.orderIndex))
      .limit(1);
    firstStepId = stepsList[0]?.id ?? null;
  }

  await db
    .update(conversations)
    .set({
      summary: null,
      summaryUpdatedAt: null,
      currentStepId: firstStepId,
      pendingProcessAt: null,
      sentMediaIds: [],
      status: "open",
      aiPaused: false,
      lastInboundAt: null,
      lastOutboundAt: null,
      lastMessageAt: null,
    })
    .where(eq(conversations.id, conversationId));

  // Avisa o realtime: histórico zerado.
  try {
    const { publish } = await import("./realtime/bus");
    publish({
      type: "status",
      conversationId,
      patch: { reset: true } as any,
    });
  } catch {
    // ignored
  }
}

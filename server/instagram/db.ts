import { createHash } from "crypto";
import { and, desc, eq, gt, gte, isNull, like, lt, or, sql } from "drizzle-orm";
import {
  channelIdentities,
  conversations,
  externalEvents,
  instagramIntegrations,
  instagramLogs,
  instagramOauthStates,
  instagramWebhookEvents,
  leads,
  messages,
  metricsEvents,
  type InsertInstagramIntegration,
  type InsertInstagramLog,
} from "../../drizzle/schema";
import { findOrCreateConversation, findOrCreateLead, getDb, updateLead } from "../db";

export async function getInstagramIntegrationByAgent(agentId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(instagramIntegrations)
    .where(eq(instagramIntegrations.agentId, agentId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getInstagramIntegrationByAccount(instagramAccountId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(instagramIntegrations)
    .where(eq(instagramIntegrations.instagramAccountId, instagramAccountId))
    .limit(1);
  return rows[0] ?? null;
}

export async function ensureInstagramIntegration(agentId: number, metaAppId: string) {
  const db = await getDb();
  if (!db) throw new Error("DB_UNAVAILABLE");
  await db
    .insert(instagramIntegrations)
    .values({ agentId, metaAppId })
    .onDuplicateKeyUpdate({ set: { metaAppId } });
  const integration = await getInstagramIntegrationByAgent(agentId);
  if (!integration) throw new Error("INSTAGRAM_INTEGRATION_NOT_FOUND");
  return integration;
}

export async function updateInstagramIntegration(
  agentId: number,
  patch: Partial<InsertInstagramIntegration>,
) {
  const db = await getDb();
  if (!db) throw new Error("DB_UNAVAILABLE");
  await db.update(instagramIntegrations).set(patch).where(eq(instagramIntegrations.agentId, agentId));
  return getInstagramIntegrationByAgent(agentId);
}

export async function createInstagramOauthState(input: {
  stateHash: string;
  agentId: number;
  userId: number;
  redirectOrigin: string;
  expiresAt: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB_UNAVAILABLE");
  await db.insert(instagramOauthStates).values(input);
}

export async function consumeInstagramOauthState(stateHash: string) {
  const db = await getDb();
  if (!db) throw new Error("DB_UNAVAILABLE");
  const result = await db
    .update(instagramOauthStates)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(instagramOauthStates.stateHash, stateHash),
        isNull(instagramOauthStates.consumedAt),
        gt(instagramOauthStates.expiresAt, new Date()),
      ),
    );
  const affectedRows = Number((result as any)?.[0]?.affectedRows ?? 0);
  if (affectedRows !== 1) return null;
  const rows = await db
    .select()
    .from(instagramOauthStates)
    .where(eq(instagramOauthStates.stateHash, stateHash))
    .limit(1);
  return rows[0] ?? null;
}

function sanitizeMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const clone = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  for (const key of Object.keys(clone)) {
    if (/token|secret|authorization|password/i.test(key)) clone[key] = "[REDACTED]";
  }
  return clone;
}

export async function logInstagram(input: InsertInstagramLog) {
  const db = await getDb();
  if (!db) return;
  await db.insert(instagramLogs).values({
    ...input,
    message: input.message?.slice(0, 500),
    metadata: sanitizeMetadata(input.metadata),
  });
}

export async function listInstagramLogs(agentId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(instagramLogs)
    .where(eq(instagramLogs.agentId, agentId))
    .orderBy(desc(instagramLogs.createdAt))
    .limit(Math.min(200, Math.max(1, limit)));
}

function syntheticInstagramLeadKey(accountId: string, igsid: string): string {
  return `IG:${createHash("sha256").update(`${accountId}:${igsid}`).digest("hex").slice(0, 32)}`;
}

export async function resolveInstagramIdentity(input: {
  agentId: number;
  accountId: string;
  igsid: string;
  username?: string | null;
  displayName?: string | null;
  profilePictureUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  channelMetadata?: Record<string, unknown> | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB_UNAVAILABLE");
  const rows = await db
    .select()
    .from(channelIdentities)
    .where(
      and(
        eq(channelIdentities.agentId, input.agentId),
        eq(channelIdentities.channel, "instagram"),
        eq(channelIdentities.accountId, input.accountId),
        eq(channelIdentities.externalUserId, input.igsid),
      ),
    )
    .limit(1);

  let identity = rows[0];
  if (!identity) {
    const leadId = await findOrCreateLead(
      input.agentId,
      syntheticInstagramLeadKey(input.accountId, input.igsid),
      input.displayName || input.username || undefined,
    );
    try {
      await db.insert(channelIdentities).values({
        agentId: input.agentId,
        leadId,
        channel: "instagram",
        accountId: input.accountId,
        externalUserId: input.igsid,
        username: input.username ?? null,
        displayName: input.displayName ?? null,
        profilePictureUrl: input.profilePictureUrl ?? null,
        metadata: input.metadata ?? null,
        lastSeenAt: new Date(),
      });
    } catch {
      // Entrega concorrente do mesmo MID/IGSID: a chave única escolhe uma identidade.
    }
    const created = await db
      .select()
      .from(channelIdentities)
      .where(
        and(
          eq(channelIdentities.agentId, input.agentId),
          eq(channelIdentities.channel, "instagram"),
          eq(channelIdentities.accountId, input.accountId),
          eq(channelIdentities.externalUserId, input.igsid),
        ),
      )
      .limit(1);
    identity = created[0];
  } else {
    await db
      .update(channelIdentities)
      .set({
        username: input.username ?? identity.username,
        displayName: input.displayName ?? identity.displayName,
        profilePictureUrl: input.profilePictureUrl ?? identity.profilePictureUrl,
        metadata: input.metadata ?? identity.metadata,
        lastSeenAt: new Date(),
      })
      .where(eq(channelIdentities.id, identity.id));
  }
  if (!identity) throw new Error("INSTAGRAM_IDENTITY_RESOLUTION_FAILED");
  if ((input.displayName || input.username) && !input.displayName?.includes("[")) {
    await updateLead(identity.leadId, {
      name: input.displayName || input.username,
    });
  }
  const conversationId = await findOrCreateConversation(input.agentId, identity.leadId, {
    channel: "instagram",
    channelMetadata: input.channelMetadata ?? undefined,
  });
  return { identity, leadId: identity.leadId, conversationId };
}

export async function getInstagramIdentityForConversation(
  agentId: number,
  leadId: number,
  accountId: string,
) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(channelIdentities)
    .where(
      and(
        eq(channelIdentities.agentId, agentId),
        eq(channelIdentities.leadId, leadId),
        eq(channelIdentities.channel, "instagram"),
        eq(channelIdentities.accountId, accountId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function createOrGetInstagramEvent(input: {
  integrationId: number | null;
  agentId: number | null;
  eventKey: string;
  eventType: string;
  providerMessageId?: string | null;
  instagramAccountId: string;
  igsid?: string | null;
  payload: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB_UNAVAILABLE");
  try {
    await db.insert(instagramWebhookEvents).values({ ...input, status: "received" });
  } catch {
    // Meta reenvia eventos por até 36h; a chave única impede nova execução.
  }
  const rows = await db
    .select()
    .from(instagramWebhookEvents)
    .where(eq(instagramWebhookEvents.eventKey, input.eventKey))
    .limit(1);
  return rows[0] ?? null;
}

export async function claimInstagramEvent(eventKey: string) {
  const db = await getDb();
  if (!db) throw new Error("DB_UNAVAILABLE");
  const result = await db
    .update(instagramWebhookEvents)
    .set({
      status: "processing",
      attemptCount: sql`${instagramWebhookEvents.attemptCount} + 1`,
      errorMessage: null,
    })
    .where(
      and(
        eq(instagramWebhookEvents.eventKey, eventKey),
        or(
          eq(instagramWebhookEvents.status, "received"),
          and(
            eq(instagramWebhookEvents.status, "failed"),
            lt(instagramWebhookEvents.attemptCount, 3),
          ),
        ),
      ),
    );
  return Number((result as any)?.[0]?.affectedRows ?? 0) === 1;
}

export async function completeInstagramEvent(eventKey: string, status: "processed" | "ignored") {
  const db = await getDb();
  if (!db) return;
  await db
    .update(instagramWebhookEvents)
    .set({ status, processedAt: new Date(), errorMessage: null })
    .where(eq(instagramWebhookEvents.eventKey, eventKey));
}

export async function failInstagramEvent(
  eventKey: string,
  error: { message: string; httpStatus?: number; code?: string; subcode?: string },
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(instagramWebhookEvents)
    .set({
      status: "failed",
      errorMessage: error.message.slice(0, 1000),
      httpStatus: error.httpStatus,
      metaErrorCode: error.code,
      metaErrorSubcode: error.subcode,
      processedAt: new Date(),
    })
    .where(eq(instagramWebhookEvents.eventKey, eventKey));
}

export type InstagramInboxFilters = {
  limit?: number;
  status?: "open" | "human_handoff" | "closed" | "archived";
  temperature?: "hot" | "warm" | "cold" | "unknown";
  tag?: string;
  search?: string;
  handoff?: boolean;
  unread?: boolean;
  minLeadScore?: number;
};

export async function listInstagramConversations(
  agentId: number,
  filters: InstagramInboxFilters = {},
) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(conversations.agentId, agentId), eq(conversations.channel, "instagram")];
  if (filters.status) conditions.push(eq(conversations.status, filters.status));
  if (filters.temperature) conditions.push(eq(leads.temperature, filters.temperature));
  if (filters.tag?.trim()) conditions.push(like(leads.tags, `%${filters.tag.trim()}%`));
  if (filters.handoff === true) {
    conditions.push(or(eq(conversations.aiPaused, true), eq(conversations.status, "human_handoff"))!);
  }
  if (filters.handoff === false) {
    conditions.push(and(eq(conversations.aiPaused, false), eq(conversations.status, "open"))!);
  }
  if (filters.unread) {
    conditions.push(or(isNull(conversations.lastOutboundAt), gt(conversations.lastInboundAt, conversations.lastOutboundAt))!);
  }
  if (filters.search?.trim()) {
    const value = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        like(leads.name, value),
        like(channelIdentities.username, value),
        like(channelIdentities.displayName, value),
      )!,
    );
  }
  if (filters.minLeadScore != null) {
    conditions.push(
      gte(sql<number>`CAST(JSON_UNQUOTE(JSON_EXTRACT(${leads.facts}, '$.leadScore')) AS SIGNED)`, filters.minLeadScore),
    );
  }
  return db
    .select({ conversation: conversations, lead: leads, identity: channelIdentities })
    .from(conversations)
    .innerJoin(leads, eq(leads.id, conversations.leadId))
    .innerJoin(
      channelIdentities,
      and(
        eq(channelIdentities.leadId, leads.id),
        eq(channelIdentities.channel, "instagram"),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(Math.min(500, Math.max(1, filters.limit ?? 200)));
}

export async function getInstagramConversation(agentId: number, conversationId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ conversation: conversations, lead: leads, identity: channelIdentities })
    .from(conversations)
    .innerJoin(leads, eq(leads.id, conversations.leadId))
    .innerJoin(
      channelIdentities,
      and(
        eq(channelIdentities.leadId, leads.id),
        eq(channelIdentities.channel, "instagram"),
      ),
    )
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.agentId, agentId),
        eq(conversations.channel, "instagram"),
      ),
    )
    .limit(1);
  if (!rows[0]) return null;
  const conversationMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);
  return { ...rows[0], messages: conversationMessages };
}

export async function findInstagramMessageByProviderId(providerMessageId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.channel, "instagram"),
        eq(messages.providerMessageId, providerMessageId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getInstagramMetrics(agentId: number, days = 30) {
  const db = await getDb();
  if (!db) {
    return {
      received: 0,
      sent: 0,
      failed: 0,
      conversations: 0,
      handoff: 0,
      averageResponseMs: null,
      webhookEvents: 0,
      webhookFailures: 0,
      qualifiedLeads: 0,
      hotLeads: 0,
      conversions: 0,
      revenueCents: null as number | null,
    };
  }
  const since = new Date(Date.now() - Math.max(1, Math.min(365, days)) * 86_400_000);
  const metricRows = await db
    .select({
      eventType: metricsEvents.eventType,
      total: sql<number>`COUNT(*)`,
      averageValue: sql<number | null>`AVG(${metricsEvents.valueNumber})`,
    })
    .from(metricsEvents)
    .innerJoin(conversations, eq(conversations.id, metricsEvents.conversationId))
    .where(
      and(
        eq(metricsEvents.agentId, agentId),
        eq(conversations.channel, "instagram"),
        gt(metricsEvents.createdAt, since),
      ),
    )
    .groupBy(metricsEvents.eventType);
  const conversationRows = await db
    .select({
      total: sql<number>`COUNT(*)`,
      handoff: sql<number>`SUM(CASE WHEN ${conversations.aiPaused} = 1 OR ${conversations.status} = 'human_handoff' THEN 1 ELSE 0 END)`,
    })
    .from(conversations)
    .where(and(eq(conversations.agentId, agentId), eq(conversations.channel, "instagram")));
  const webhookRows = await db
    .select({
      total: sql<number>`COUNT(*)`,
      failed: sql<number>`SUM(CASE WHEN ${instagramWebhookEvents.status} = 'failed' THEN 1 ELSE 0 END)`,
    })
    .from(instagramWebhookEvents)
    .where(
      and(
        eq(instagramWebhookEvents.agentId, agentId),
        gt(instagramWebhookEvents.receivedAt, since),
      ),
    );
  const leadRows = await db
    .select({
      qualified: sql<number>`SUM(CASE WHEN ${leads.temperature} IN ('hot', 'warm') THEN 1 ELSE 0 END)`,
      hot: sql<number>`SUM(CASE WHEN ${leads.temperature} = 'hot' THEN 1 ELSE 0 END)`,
    })
    .from(conversations)
    .innerJoin(leads, eq(leads.id, conversations.leadId))
    .where(and(eq(conversations.agentId, agentId), eq(conversations.channel, "instagram")));
  const conversionRows = await db
    .select({ eventType: externalEvents.eventType, payload: externalEvents.payload })
    .from(externalEvents)
    .innerJoin(conversations, eq(conversations.leadId, externalEvents.leadId))
    .where(
      and(
        eq(externalEvents.agentId, agentId),
        eq(conversations.channel, "instagram"),
        gt(externalEvents.receivedAt, since),
      ),
    );
  const purchaseRows = conversionRows.filter(row => /purchase|paid|approved/i.test(row.eventType));
  const explicitRevenue = purchaseRows
    .map(row => {
      const payload = (row.payload || {}) as any;
      const value =
        payload.amountCents ??
        payload.amount_cents ??
        payload.data?.amountCents ??
        payload.data?.amount_cents;
      return Number.isFinite(Number(value)) ? Number(value) : null;
    })
    .filter((value): value is number => value != null && value >= 0);
  const byType = Object.fromEntries(metricRows.map(row => [row.eventType, row]));
  return {
    received: Number(byType.message_received?.total ?? 0),
    sent: Number(byType.message_sent?.total ?? 0),
    failed: Number(byType.message_failed?.total ?? 0),
    conversations: Number(conversationRows[0]?.total ?? 0),
    handoff: Number(conversationRows[0]?.handoff ?? 0),
    averageResponseMs:
      byType.response_time_ms?.averageValue == null
        ? null
        : Math.round(Number(byType.response_time_ms.averageValue)),
    webhookEvents: Number(webhookRows[0]?.total ?? 0),
    webhookFailures: Number(webhookRows[0]?.failed ?? 0),
    qualifiedLeads: Number(leadRows[0]?.qualified ?? 0),
    hotLeads: Number(leadRows[0]?.hot ?? 0),
    conversions: purchaseRows.length,
    revenueCents:
      explicitRevenue.length > 0
        ? explicitRevenue.reduce((sum, value) => sum + value, 0)
        : null,
  };
}

import { and, desc, eq, or, sql } from "drizzle-orm";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "crypto";
import {
  publicSimulatorConfigs,
  publicSimulatorConversions,
  publicSimulatorRequests,
  publicSimulatorSessions,
  leads,
  conversations,
  messages,
  type InsertPublicSimulatorConfig,
  type InsertPublicSimulatorConversion,
  type InsertPublicSimulatorSession,
} from "../../drizzle/schema";
import {
  appendMessage,
  findOrCreateConversation,
  findOrCreateLead,
  getDb,
  updateLead,
} from "../db";

export const DEFAULT_WELCOME_MESSAGE =
  "Olá! Tudo bem? Meu nome é RAVI e sou especialista aqui na WeDrop. Você quer entender como funciona o nosso modelo de negócio de vendas online sem estoque?";

export const DEFAULT_PURCHASE_EVENTS = [
  "order.paid",
  "invoice.paid",
  "charge.paid",
];

export const DEFAULT_CHECKOUT_PATTERNS = [
  "quero o link",
  "manda o link",
  "me passa o link",
  "como faço para comprar",
  "quero comprar",
  "onde eu compro",
  "checkout",
];

export function hashPublicToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyPublicToken(token: string, expectedHash: string): boolean {
  if (!token || !expectedHash) return false;
  const actual = Buffer.from(hashPublicToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function generatePublicCredentials() {
  return {
    publicId: randomUUID().replace(/-/g, ""),
    token: randomBytes(32).toString("base64url"),
  };
}

export async function getPublicSimulatorConfigBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(publicSimulatorConfigs)
    .where(eq(publicSimulatorConfigs.slug, slug))
    .limit(1);
  return rows[0];
}

export async function getPublicSimulatorConfigByAgent(agentId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(publicSimulatorConfigs)
    .where(eq(publicSimulatorConfigs.agentId, agentId))
    .limit(1);
  return rows[0];
}

export async function ensurePublicSimulatorConfig(agentId: number) {
  const existing = await getPublicSimulatorConfigByAgent(agentId);
  if (existing) return existing;
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const slugBase = "ravi";
  const slugInUse = await getPublicSimulatorConfigBySlug(slugBase);
  const slug = slugInUse ? `${slugBase}-${agentId}` : slugBase;
  await db.insert(publicSimulatorConfigs).values({
    agentId,
    slug,
    enabled: true,
    displayName: "RAVI",
    statusText: "online",
    accentColor: "#00a884",
    welcomeMessage: DEFAULT_WELCOME_MESSAGE,
    startButtonText: "SIM, QUERO SABER",
    startLeadMessage: "Sim, quero saber como funciona.",
    inputPlaceholder: "Digite uma mensagem",
    checkoutButtonText: "ABRIR CHECKOUT",
    webhookSecret: randomBytes(32).toString("hex"),
    purchaseEventNames: DEFAULT_PURCHASE_EVENTS,
    checkoutRequestPatterns: DEFAULT_CHECKOUT_PATTERNS,
  } satisfies InsertPublicSimulatorConfig);
  const created = await getPublicSimulatorConfigByAgent(agentId);
  if (!created) throw new Error("Falha ao criar configuração do simulador");
  return created;
}

export async function updatePublicSimulatorConfig(
  agentId: number,
  patch: Partial<InsertPublicSimulatorConfig>,
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await ensurePublicSimulatorConfig(agentId);
  await db
    .update(publicSimulatorConfigs)
    .set(patch)
    .where(eq(publicSimulatorConfigs.agentId, agentId));
  return getPublicSimulatorConfigByAgent(agentId);
}

export type PublicSessionMetadata = {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  referrer?: string | null;
  landingUrl?: string | null;
  userAgent?: string | null;
  ipHash?: string | null;
};

export async function createPublicSimulatorSession(
  config: typeof publicSimulatorConfigs.$inferSelect,
  metadata: PublicSessionMetadata,
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const { publicId, token } = generatePublicCredentials();
  const syntheticPhone = `SIMWEB:${publicId}`;
  const leadId = await findOrCreateLead(config.agentId, syntheticPhone);
  const conversationId = await findOrCreateConversation(config.agentId, leadId, { channel: "web" });

  await appendMessage({
    conversationId,
    direction: "outbound",
    sender: "ai",
    contentType: "text",
    body: config.welcomeMessage,
  });

  const insert = await db.insert(publicSimulatorSessions).values({
    publicId,
    accessTokenHash: hashPublicToken(token),
    configId: config.id,
    agentId: config.agentId,
    leadId,
    conversationId,
    status: "waiting",
    ...metadata,
  } satisfies InsertPublicSimulatorSession);
  const id = (insert as any)[0]?.insertId as number;
  const session = await getPublicSimulatorSessionById(id);
  if (!session) throw new Error("Falha ao criar sessão pública");
  return { session, token };
}

export async function getPublicSimulatorSessionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(publicSimulatorSessions)
    .where(eq(publicSimulatorSessions.id, id))
    .limit(1);
  return rows[0];
}

export async function getPublicSimulatorSession(publicId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(publicSimulatorSessions)
    .where(eq(publicSimulatorSessions.publicId, publicId))
    .limit(1);
  return rows[0];
}

export async function requirePublicSimulatorSession(
  publicId: string,
  token: string,
) {
  const session = await getPublicSimulatorSession(publicId);
  if (!session || !verifyPublicToken(token, session.accessTokenHash)) {
    throw new Error("INVALID_PUBLIC_SESSION");
  }
  const db = await getDb();
  if (db) {
    await db
      .update(publicSimulatorSessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(publicSimulatorSessions.id, session.id));
  }
  return session;
}

export async function updatePublicSimulatorSession(
  id: number,
  patch: Partial<InsertPublicSimulatorSession>,
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(publicSimulatorSessions)
    .set(patch)
    .where(eq(publicSimulatorSessions.id, id));
}

export async function persistCapturedContact(
  session: typeof publicSimulatorSessions.$inferSelect,
  contact: { name?: string | null; phone?: string | null; email?: string | null },
) {
  const sessionPatch: Partial<InsertPublicSimulatorSession> = {};
  const leadPatch: Partial<typeof leads.$inferInsert> = {};
  if (contact.name && !session.capturedName) {
    sessionPatch.capturedName = contact.name;
    leadPatch.name = contact.name;
  }
  if (contact.phone && !session.capturedPhone) {
    sessionPatch.capturedPhone = contact.phone;
    leadPatch.phoneNumber = contact.phone;
  }
  if (contact.email && !session.capturedEmail) {
    sessionPatch.capturedEmail = contact.email;
    leadPatch.email = contact.email;
  }
  if (Object.keys(sessionPatch).length > 0) {
    await updatePublicSimulatorSession(session.id, sessionPatch);
  }
  // Não trocamos a chave sintética `leads.phoneNumber`: ela é única e
  // identifica esta sessão. O telefone real fica em email/customFields/facts
  // e nos campos dedicados da sessão pública.
  delete leadPatch.phoneNumber;
  if (contact.phone) {
    leadPatch.customFields = { publicSimulatorPhone: contact.phone };
  }
  if (Object.keys(leadPatch).length > 0) {
    await updateLead(session.leadId, leadPatch);
  }
}

export async function listPublicSessionMessages(conversationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);
}

export async function beginPublicRequest(
  sessionId: number,
  requestId: string,
  kind: "start" | "text" | "audio",
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db
    .select()
    .from(publicSimulatorRequests)
    .where(
      and(
        eq(publicSimulatorRequests.sessionId, sessionId),
        eq(publicSimulatorRequests.requestId, requestId),
      ),
    )
    .limit(1);
  if (existing[0]) return { created: false as const, request: existing[0] };
  try {
    const result = await db.insert(publicSimulatorRequests).values({
      sessionId,
      requestId,
      kind,
      status: "processing",
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    const id = (result as any)[0]?.insertId as number;
    const rows = await db
      .select()
      .from(publicSimulatorRequests)
      .where(eq(publicSimulatorRequests.id, id))
      .limit(1);
    return { created: true as const, request: rows[0] };
  } catch {
    const rows = await db
      .select()
      .from(publicSimulatorRequests)
      .where(
        and(
          eq(publicSimulatorRequests.sessionId, sessionId),
          eq(publicSimulatorRequests.requestId, requestId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new Error("Falha ao registrar requisição pública");
    return { created: false as const, request: rows[0] };
  }
}

export async function getPublicRequestForSession(sessionId: number, requestId: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db
    .select()
    .from(publicSimulatorRequests)
    .where(
      and(
        eq(publicSimulatorRequests.sessionId, sessionId),
        eq(publicSimulatorRequests.requestId, requestId),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function recoverPublicRequestForSession(sessionId: number, requestId: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const now = new Date();
  const request = await getPublicRequestForSession(sessionId, requestId);
  if (!request) return undefined;

  const expiresAt = request.expiresAt ?? new Date(request.createdAt.getTime() + 10 * 60_000);
  if (request.status === "processing" && expiresAt.getTime() <= now.getTime()) {
    await db
      .update(publicSimulatorRequests)
      .set({
        status: "expired",
        errorMessage: "Tempo máximo de processamento excedido",
        completedAt: now,
        lastRecoveryAt: now,
        recoveryAttempts: sql`${publicSimulatorRequests.recoveryAttempts} + 1`,
        lastHttpStatus: 410,
      })
      .where(
        and(
          eq(publicSimulatorRequests.sessionId, sessionId),
          eq(publicSimulatorRequests.requestId, requestId),
          eq(publicSimulatorRequests.status, "processing"),
        ),
      );
    return getPublicRequestForSession(sessionId, requestId);
  }

  const httpStatus = request.status === "completed" ? 200 : request.status === "failed" ? 422 : 202;
  await db
    .update(publicSimulatorRequests)
    .set({
      lastRecoveryAt: now,
      recoveryAttempts: sql`${publicSimulatorRequests.recoveryAttempts} + 1`,
      lastHttpStatus: httpStatus,
    })
    .where(
      and(
        eq(publicSimulatorRequests.sessionId, sessionId),
        eq(publicSimulatorRequests.requestId, requestId),
      ),
    );
  return {
    ...request,
    expiresAt,
    lastRecoveryAt: now,
    recoveryAttempts: request.recoveryAttempts + 1,
    lastHttpStatus: httpStatus,
  };
}

export async function completePublicRequest(sessionId: number, requestId: string, response: unknown) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(publicSimulatorRequests)
    .set({ status: "completed", response, completedAt: new Date(), lastHttpStatus: 200 })
    .where(
      and(
        eq(publicSimulatorRequests.sessionId, sessionId),
        eq(publicSimulatorRequests.requestId, requestId),
      ),
    );
}

export async function failPublicRequest(sessionId: number, requestId: string, errorMessage: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(publicSimulatorRequests)
    .set({
      status: "failed",
      errorMessage: errorMessage.slice(0, 1000),
      completedAt: new Date(),
      lastHttpStatus: 422,
    })
    .where(
      and(
        eq(publicSimulatorRequests.sessionId, sessionId),
        eq(publicSimulatorRequests.requestId, requestId),
      ),
    );
}

export async function recordPublicConversion(
  input: InsertPublicSimulatorConversion,
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  try {
    await db.insert(publicSimulatorConversions).values(input);
    return true;
  } catch {
    // eventId único: webhooks e cliques podem ser reenviados sem duplicar.
    return false;
  }
}

export async function findPublicSessionForPurchase(input: {
  publicId?: string | null;
  phone?: string | null;
  email?: string | null;
}) {
  const db = await getDb();
  if (!db) return undefined;
  const conditions = [];
  if (input.publicId) conditions.push(eq(publicSimulatorSessions.publicId, input.publicId));
  if (input.phone) conditions.push(eq(publicSimulatorSessions.capturedPhone, input.phone));
  if (input.email) conditions.push(eq(publicSimulatorSessions.capturedEmail, input.email));
  if (conditions.length === 0) return undefined;
  const rows = await db
    .select()
    .from(publicSimulatorSessions)
    .where(or(...conditions))
    .orderBy(desc(publicSimulatorSessions.createdAt))
    .limit(1);
  return rows[0];
}

export async function listPublicSimulatorSessions(agentId: number, limit = 200) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      session: publicSimulatorSessions,
      lead: leads,
      conversation: conversations,
    })
    .from(publicSimulatorSessions)
    .innerJoin(leads, eq(leads.id, publicSimulatorSessions.leadId))
    .innerJoin(conversations, eq(conversations.id, publicSimulatorSessions.conversationId))
    .where(eq(publicSimulatorSessions.agentId, agentId))
    .orderBy(desc(publicSimulatorSessions.createdAt))
    .limit(Math.min(500, Math.max(1, limit)));
}

export async function getPublicSimulatorSessionAdmin(agentId: number, sessionId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select({
      session: publicSimulatorSessions,
      lead: leads,
      conversation: conversations,
    })
    .from(publicSimulatorSessions)
    .innerJoin(leads, eq(leads.id, publicSimulatorSessions.leadId))
    .innerJoin(conversations, eq(conversations.id, publicSimulatorSessions.conversationId))
    .where(
      and(
        eq(publicSimulatorSessions.agentId, agentId),
        eq(publicSimulatorSessions.id, sessionId),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function listPublicConversions(sessionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(publicSimulatorConversions)
    .where(eq(publicSimulatorConversions.sessionId, sessionId))
    .orderBy(publicSimulatorConversions.createdAt);
}

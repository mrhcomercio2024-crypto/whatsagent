import { and, desc, eq } from "drizzle-orm";
import {
  publicPushSubscriptions,
  publicSimulatorSessions,
  type InsertPublicPushSubscription,
} from "../../../drizzle/schema";
import { getDb } from "../../db";
import { encryptPushSecret, hashPushEndpoint } from "./crypto";

export type BrowserPushSubscription = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

export function detectPushClient(userAgent: string) {
  const ua = userAgent.toLowerCase();
  const browser = ua.includes("edg/")
    ? "Edge"
    : ua.includes("chrome/") || ua.includes("crios/")
      ? "Chrome"
      : ua.includes("firefox/") || ua.includes("fxios/")
        ? "Firefox"
        : ua.includes("safari/")
          ? "Safari"
          : "Outro";
  const device = /iphone|ipad|ipod/.test(ua)
    ? "iOS"
    : /android/.test(ua)
      ? "Android"
      : "Desktop";
  return { browser, device };
}

export async function savePushSubscription(input: {
  session: typeof publicSimulatorSessions.$inferSelect;
  subscription: BrowserPushSubscription;
  userAgent: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB_UNAVAILABLE");
  const { session, subscription, userAgent } = input;
  if (!subscription.endpoint.startsWith("https://")) throw new Error("PUSH_ENDPOINT_INVALID");
  if (subscription.endpoint.length > 4000) throw new Error("PUSH_ENDPOINT_TOO_LONG");
  if (!subscription.keys?.p256dh || !subscription.keys?.auth) throw new Error("PUSH_KEYS_REQUIRED");
  const endpointHash = hashPushEndpoint(subscription.endpoint);
  const client = detectPushClient(userAgent);
  const values: InsertPublicPushSubscription = {
    configId: session.configId,
    agentId: session.agentId,
    sessionId: session.id,
    leadId: session.leadId,
    conversationId: session.conversationId,
    endpointHash,
    endpointCiphertext: encryptPushSecret(subscription.endpoint),
    p256dhCiphertext: encryptPushSecret(subscription.keys.p256dh),
    authCiphertext: encryptPushSecret(subscription.keys.auth),
    permissionStatus: "granted",
    browser: client.browser,
    device: client.device,
    userAgent: userAgent.slice(0, 1000),
    active: true,
    failureCount: 0,
    invalidatedAt: null,
    revokedAt: null,
  };
  await db
    .insert(publicPushSubscriptions)
    .values(values)
    .onDuplicateKeyUpdate({
      set: {
        configId: values.configId,
        agentId: values.agentId,
        sessionId: values.sessionId,
        leadId: values.leadId,
        conversationId: values.conversationId,
        endpointCiphertext: values.endpointCiphertext,
        p256dhCiphertext: values.p256dhCiphertext,
        authCiphertext: values.authCiphertext,
        permissionStatus: "granted",
        browser: values.browser,
        device: values.device,
        userAgent: values.userAgent,
        active: true,
        failureCount: 0,
        invalidatedAt: null,
        revokedAt: null,
      },
    });
  const rows = await db
    .select({
      id: publicPushSubscriptions.id,
      active: publicPushSubscriptions.active,
      browser: publicPushSubscriptions.browser,
      device: publicPushSubscriptions.device,
    })
    .from(publicPushSubscriptions)
    .where(eq(publicPushSubscriptions.endpointHash, endpointHash))
    .limit(1);
  await db
    .update(publicSimulatorSessions)
    .set({ pushConsentGrantedAt: new Date(), pushConsentDeclinedAt: null, pushOptedOutAt: null })
    .where(eq(publicSimulatorSessions.id, session.id));
  return rows[0];
}

export async function revokePushSubscription(input: {
  sessionId: number;
  endpoint: string;
  permissionStatus?: "default" | "denied";
}) {
  const db = await getDb();
  if (!db) throw new Error("DB_UNAVAILABLE");
  const now = new Date();
  const endpointHash = hashPushEndpoint(input.endpoint);
  await db
    .update(publicPushSubscriptions)
    .set({
      active: false,
      permissionStatus: input.permissionStatus || "default",
      revokedAt: now,
    })
    .where(
      and(
        eq(publicPushSubscriptions.sessionId, input.sessionId),
        eq(publicPushSubscriptions.endpointHash, endpointHash),
      ),
    );
  await db
    .update(publicSimulatorSessions)
    .set({ pushOptedOutAt: now })
    .where(eq(publicSimulatorSessions.id, input.sessionId));
}

export async function revokeAllPushSubscriptionsForSession(
  sessionId: number,
  permissionStatus: "default" | "denied" = "default",
) {
  const db = await getDb();
  if (!db) throw new Error("DB_UNAVAILABLE");
  const now = new Date();
  await db
    .update(publicPushSubscriptions)
    .set({ active: false, permissionStatus, revokedAt: now })
    .where(
      and(
        eq(publicPushSubscriptions.sessionId, sessionId),
        eq(publicPushSubscriptions.active, true),
      ),
    );
  await db
    .update(publicSimulatorSessions)
    .set({ pushOptedOutAt: now })
    .where(eq(publicSimulatorSessions.id, sessionId));
}

export async function markPushConsentOffered(sessionId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(publicSimulatorSessions)
    .set({ pushConsentOfferedAt: new Date() })
    .where(eq(publicSimulatorSessions.id, sessionId));
}

export async function markPushConsentDeclined(sessionId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(publicSimulatorSessions)
    .set({ pushConsentDeclinedAt: new Date() })
    .where(eq(publicSimulatorSessions.id, sessionId));
}

export async function getActiveSubscriptionForSession(sessionId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(publicPushSubscriptions)
    .where(
      and(
        eq(publicPushSubscriptions.sessionId, sessionId),
        eq(publicPushSubscriptions.active, true),
      ),
    )
    .orderBy(desc(publicPushSubscriptions.updatedAt))
    .limit(1);
  return rows[0];
}

export async function countActivePushSubscriptions(agentId: number) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ id: publicPushSubscriptions.id })
    .from(publicPushSubscriptions)
    .where(
      and(
        eq(publicPushSubscriptions.agentId, agentId),
        eq(publicPushSubscriptions.active, true),
      ),
    );
  return rows.length;
}

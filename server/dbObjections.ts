/**
 * Helpers de DB isolados para objeções, dispatches e step_media_links.
 * Mantidos fora de db.ts para evitar inflar o arquivo principal.
 */

import { and, asc, eq } from "drizzle-orm";
import { getDb } from "./db";
import {
  objections,
  objectionDispatches,
  stepMediaLinks,
  type InsertObjection,
  type InsertStepMediaLink,
  type Objection,
  type StepMediaLink,
} from "../drizzle/schema";
import { invalidateObjectionsCache } from "./ai/objectionHandler";

// ════════════════════════════════════════════════════════════
// OBJECTIONS
// ════════════════════════════════════════════════════════════

export async function listObjections(agentId: number): Promise<Objection[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(objections)
    .where(eq(objections.agentId, agentId))
    .orderBy(asc(objections.priority), asc(objections.id));
}

export async function getObjectionById(id: number): Promise<Objection | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(objections).where(eq(objections.id, id)).limit(1);
  return rows[0];
}

export async function createObjection(input: InsertObjection): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const r = await db.insert(objections).values(input);
  invalidateObjectionsCache(input.agentId);
  return (r as any)[0]?.insertId as number;
}

export async function updateObjection(
  id: number,
  patch: Partial<InsertObjection>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(objections).set(patch).where(eq(objections.id, id));
  // Invalidar cache: precisamos do agentId; busca rápida
  const row = await db
    .select({ agentId: objections.agentId })
    .from(objections)
    .where(eq(objections.id, id))
    .limit(1);
  if (row[0]) invalidateObjectionsCache(row[0].agentId);
}

export async function deleteObjection(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const row = await db
    .select({ agentId: objections.agentId })
    .from(objections)
    .where(eq(objections.id, id))
    .limit(1);
  await db.delete(objections).where(eq(objections.id, id));
  if (row[0]) invalidateObjectionsCache(row[0].agentId);
}

export async function listObjectionDispatches(conversationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(objectionDispatches)
    .where(eq(objectionDispatches.conversationId, conversationId))
    .orderBy(asc(objectionDispatches.dispatchedAt));
}

export async function clearObjectionDispatches(conversationId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(objectionDispatches)
    .where(eq(objectionDispatches.conversationId, conversationId));
}

// ════════════════════════════════════════════════════════════
// STEP MEDIA LINKS
// ════════════════════════════════════════════════════════════

export async function listStepMediaLinks(stepId: number): Promise<StepMediaLink[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(stepMediaLinks)
    .where(eq(stepMediaLinks.stepId, stepId));
}

export async function createStepMediaLink(input: InsertStepMediaLink): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const r = await db.insert(stepMediaLinks).values(input);
  return (r as any)[0]?.insertId as number;
}

export async function updateStepMediaLink(
  id: number,
  patch: Partial<InsertStepMediaLink>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(stepMediaLinks).set(patch).where(eq(stepMediaLinks.id, id));
}

export async function deleteStepMediaLink(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(stepMediaLinks).where(eq(stepMediaLinks.id, id));
}

export async function listStepMediaLinksByFireWhen(
  stepId: number,
  fireWhen: "on_enter" | "on_advance" | "on_demand"
): Promise<StepMediaLink[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(stepMediaLinks)
    .where(
      and(
        eq(stepMediaLinks.stepId, stepId),
        eq(stepMediaLinks.fireWhen, fireWhen),
        eq(stepMediaLinks.isActive, true)
      )
    );
}

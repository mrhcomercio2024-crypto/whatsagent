import { getDb } from "../server/db";
import { leads, agents, conversations } from "../drizzle/schema";
import { desc } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) {
    console.log("no db");
    return;
  }
  const ag = await db.select().from(agents);
  console.log("=== AGENTS ===");
  for (const a of ag) {
    console.log(JSON.stringify(a, null, 2));
  }
  console.log("\n=== LEADS (últimos 15) ===");
  const ls = await db.select().from(leads).orderBy(desc(leads.id)).limit(15);
  for (const l of ls) {
    console.log(
      `#${l.id} agent=${l.agentId} phone="${l.phoneNumber}" name="${l.name ?? "-"}" status=${l.statusTag ?? "-"}`
    );
  }
  console.log("\n=== CONVERSATIONS recentes (últimas 8) ===");
  const cs = await db.select().from(conversations).orderBy(desc(conversations.id)).limit(8);
  for (const c of cs) {
    console.log(
      `conv #${c.id} agent=${c.agentId} lead=${c.leadId} status=${c.status} aiPaused=${c.aiPaused}`
    );
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

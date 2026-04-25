import { getDb } from "../server/db";
import { messages, conversations, leads } from "../drizzle/schema";
import { eq, asc } from "drizzle-orm";

async function main() {
  const db = await getDb();
  const ls = await db.select().from(leads);
  console.log('Phones:', ls.map((l:any)=>({id:l.id,phone:l.phoneNumber,name:l.name})));
  const sim = ls.find((l: any) => (l.phoneNumber || "").toUpperCase().includes("SIMULAT"));
  console.log("Sim lead:", sim);
  if (!sim) return;
  const cs = await db.select().from(conversations).where(eq(conversations.leadId, sim.id));
  console.log("Convs do simulador:", cs.length);
  for (const c of cs) {
    console.log(`\n=== conv ${c.id} | currentStep=${c.currentStepId} | agentId=${c.agentId} ===`);
    console.log(`summary=${c.summary || "(vazio)"}`);
    const msgs = await db.select().from(messages).where(eq(messages.conversationId, c.id)).orderBy(asc(messages.createdAt));
    for (const m of msgs.slice(-30)) {
      const tag = m.direction === "inbound" ? ">>" : "<<";
      const meta = m.metadata ? JSON.parse(m.metadata) : null;
      const stepId = meta?.stepId ?? "-";
      console.log(`  ${tag} [step=${stepId}] ${(m.body || "").substring(0, 250)}`);
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

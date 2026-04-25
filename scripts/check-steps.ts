import { getDb } from "../server/db";
import { scriptSteps, conversations } from "../drizzle/schema";
import { eq, asc } from "drizzle-orm";

async function main() {
  const db = await getDb();
  const ravi = 1;
  const steps = await db.select().from(scriptSteps).where(eq(scriptSteps.agentId, ravi)).orderBy(asc(scriptSteps.orderIndex));
  console.log("Total steps:", steps.length);
  for (const s of steps) console.log(`id=${s.id} order=${s.orderIndex} name=${s.name} mandatory=${s.isMandatory}`);
  const c = await db.select().from(conversations).where(eq(conversations.id, 1));
  console.log("Conversation 1:", { currentStepId: c[0]?.currentStepId, summary: (c[0]?.summary || "").substring(0, 200) });
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

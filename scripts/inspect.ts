import { getDb } from "../server/db";
import { agents, agentBrain, scriptSteps, conversations } from "../drizzle/schema";
import { eq, asc } from "drizzle-orm";

async function main() {
  const db = await getDb();
  const list = await db.select().from(agents);
  console.log("=== AGENTES ===");
  for (const a of list) {
    console.log(`- ${a.id} | ${a.name} | model=${a.defaultLlmModel}`);
  }

  const ravi = list.find((a: any) => (a.name || "").toLowerCase().includes("ravi"));
  if (!ravi) { console.log("Ravi não encontrado"); return; }
  console.log(`\n=== AGENTE RAVI: ${ravi.id} ===\n`);

  const brain = await db.select().from(agentBrain).where(eq(agentBrain.agentId, ravi.id));
  console.log("--- BRAIN ---");
  for (const b of brain) {
    for (const k of Object.keys(b)) {
      const v: any = (b as any)[k];
      if (typeof v === "string" && v.length > 0) {
        console.log(`\n>>> [${k}]:\n${v}`);
      }
    }
  }

  const steps = await db.select().from(scriptSteps).where(eq(scriptSteps.agentId, ravi.id)).orderBy(asc(scriptSteps.orderIndex));
  console.log("\n\n--- STEPS ---");
  for (const s of steps) {
    console.log(`\n[${s.orderIndex}] ${s.name} | mandatory=${s.isMandatory} | literalMode=${s.literalMode} | maxMessages=${s.maxMessages}`);
    console.log(`  instructions: ${s.instructions || ""}`);
    console.log(`  completionCriteria: ${s.completionCriteria || ""}`);
    if (s.literalText) console.log(`  literalText: ${s.literalText}`);
  }

  const convs = await db.select().from(conversations).where(eq(conversations.agentId, ravi.id));
  console.log(`\n--- CONVS (${convs.length}) ---`);
  for (const c of convs.slice(-3)) {
    console.log(`conv ${c.id} | currentStep=${c.currentStepId} | summary=${(c.summary || "").substring(0, 300)}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

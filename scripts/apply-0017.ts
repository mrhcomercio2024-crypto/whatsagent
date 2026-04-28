import { getDb } from "../server/db";
import fs from "fs";
import path from "path";

async function main() {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "drizzle", "0017_opposite_dragon_man.sql"),
    "utf-8"
  );
  const stmts = sql.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean);
  const db = await getDb();
  // Drizzle MySQL2 expõe execute via session
  for (const s of stmts) {
    console.log("⏵", s.split("\n")[0]);
    try {
      await (db as any).execute(s);
    } catch (e: any) {
      const m = (e.message || "").toLowerCase();
      if (m.includes("already exists") || m.includes("duplicate")) {
        console.log("  (já existia, ok)");
      } else {
        throw e;
      }
    }
  }
  console.log("✓ migration 0016 aplicada");
  process.exit(0);
}
main().catch(e => {
  console.error(e);
  process.exit(1);
});

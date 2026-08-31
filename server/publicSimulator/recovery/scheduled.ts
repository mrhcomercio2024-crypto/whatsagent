import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { publicSimulatorConfigs } from "../../../drizzle/schema";
import { getDb } from "../../db";
import { sdk } from "../../_core/sdk";
import { processDueRecoveryJobs } from "./service";

export function registerRecoveryScheduledRoute(app: Express) {
  app.post("/api/scheduled/public-push-followups", async (req: Request, res: Response) => {
    let taskUid: string | undefined;
    try {
      const user = await sdk.authenticateRequest(req);
      taskUid = user.taskUid;
      if (!user.isCron || !taskUid) {
        return res.status(403).json({ error: "cron-only" });
      }
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "database-unavailable" });
      const rows = await db
        .select({ id: publicSimulatorConfigs.id, enabled: publicSimulatorConfigs.pushEnabled })
        .from(publicSimulatorConfigs)
        .where(eq(publicSimulatorConfigs.recoveryCronTaskUid, taskUid))
        .limit(1);
      const config = rows[0];
      if (!config) return res.json({ ok: true, skipped: "orphan" });
      if (!config.enabled) return res.json({ ok: true, skipped: "push-disabled" });
      const result = await processDueRecoveryJobs(100);
      return res.json({ ok: true, ...result, timestamp: new Date().toISOString() });
    } catch (error) {
      return res.status(500).json({
        error: String((error as Error).message),
        stack: (error as Error).stack,
        context: { url: req.originalUrl, taskUid },
        timestamp: new Date().toISOString(),
      });
    }
  });
}

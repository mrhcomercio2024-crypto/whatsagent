import type { Express, Request, Response } from "express";
import { verifyPushEventToken } from "./crypto";
import { registerBrowserPushEvent } from "../recovery/service";

export function registerPublicPushEventRoutes(app: Express) {
  app.post("/api/public-push/event", async (req: Request, res: Response) => {
    const pushId = String(req.body?.pushId || "").slice(0, 64);
    const eventToken = String(req.body?.eventToken || "").slice(0, 200);
    const eventType = req.body?.eventType;
    if (!pushId || !verifyPushEventToken(pushId, eventToken)) {
      return res.status(401).json({ ok: false, error: "invalid-event-token" });
    }
    if (eventType !== "delivered" && eventType !== "clicked") {
      return res.status(400).json({ ok: false, error: "invalid-event-type" });
    }
    try {
      const recorded = await registerBrowserPushEvent({ pushId, eventType });
      return res.json({ ok: true, recorded });
    } catch (error) {
      return res.status(500).json({ ok: false, error: String((error as Error).message) });
    }
  });
}

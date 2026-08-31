import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const serviceWorker = fs.readFileSync(path.join(root, "client/public/sw.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "client/public/manifest.webmanifest"), "utf8"));
const chat = fs.readFileSync(path.join(root, "client/src/pages/PublicSimulatorChat.tsx"), "utf8");
const scheduled = fs.readFileSync(path.join(root, "server/publicSimulator/recovery/scheduled.ts"), "utf8");
const recovery = fs.readFileSync(path.join(root, "server/publicSimulator/recovery/service.ts"), "utf8");

describe("Ravi Web PWA and recovery source guards", () => {
  it("has an installable standalone manifest", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toContain("/simulador/ravi");
    expect(manifest.icons).toHaveLength(2);
  });

  it("shows notifications and focuses or opens the existing conversation", () => {
    expect(serviceWorker).toContain('self.addEventListener("push"');
    expect(serviceWorker).toContain('self.addEventListener("notificationclick"');
    expect(serviceWorker).toContain("client.navigate(target)");
    expect(serviceWorker).toContain("client.focus()");
    expect(serviceWorker).toContain("self.clients.openWindow(target)");
  });

  it("asks browser permission only inside an explicit click handler", () => {
    expect(chat).toContain("const enablePush = async () =>");
    expect(chat).toContain("subscribeBrowserToPush");
    expect(chat).toContain("onClick={enablePush}");
    expect(chat).not.toContain("Notification.requestPermission()");
  });

  it("delays iPhone installation guidance until strong interest", () => {
    expect(chat).toContain("showIosInstructions && strongInterest");
    expect(chat).toContain("Adicionar à Tela de Início");
  });

  it("authenticates the scheduled endpoint as cron-only", () => {
    expect(scheduled).toContain('"/api/scheduled/public-push-followups"');
    expect(scheduled).toContain("user.isCron");
    expect(scheduled).toContain("user.taskUid");
    expect(scheduled).toContain("processDueRecoveryJobs");
  });

  it("keeps permanent endpoint errors, cooldown and sequence limit guarded", () => {
    expect(recovery).toContain("statusCode === 404 || statusCode === 410");
    expect(recovery).toContain("pushGlobalCooldownMinutes");
    expect(recovery).toContain("pushMaxPerSequence");
    expect(recovery).toContain("purchaseAfterPushAt");
    expect(recovery).toContain("revenueAfterPushCents");
  });
});

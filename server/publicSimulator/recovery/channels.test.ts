import { describe, expect, it, vi } from "vitest";
import { deliverRecovery, getActiveRecoveryChannels, registerRecoveryChannelAdapter } from "./channels";

describe("multichannel recovery adapters", () => {
  it("ships with push as the active delivery channel", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    registerRecoveryChannelAdapter({ channel: "push", send });
    expect(getActiveRecoveryChannels()).toContain("push");
    await deliverRecovery({ channel: "push", title: "Ravi", body: "Oi", url: "/simulador/ravi", pushId: "p1", eventToken: "t1" });
    expect(send).toHaveBeenCalledOnce();
  });

  it("allows adding future email/instagram/whatsapp adapters without changing the engine", () => {
    registerRecoveryChannelAdapter({ channel: "email", send: vi.fn().mockResolvedValue(undefined) });
    registerRecoveryChannelAdapter({ channel: "instagram", send: vi.fn().mockResolvedValue(undefined) });
    registerRecoveryChannelAdapter({ channel: "whatsapp", send: vi.fn().mockResolvedValue(undefined) });
    expect(getActiveRecoveryChannels()).toEqual(expect.arrayContaining(["push", "email", "instagram", "whatsapp"]));
  });
});

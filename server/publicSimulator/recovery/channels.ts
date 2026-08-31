import type { BrowserPushSubscription } from "../push/db";

export type RecoveryDeliveryChannel = "push" | "email" | "instagram" | "whatsapp";

export type RecoveryDeliveryInput = {
  channel: RecoveryDeliveryChannel;
  title: string;
  body: string;
  url: string;
  pushId: string;
  eventToken: string;
  pushSubscription?: BrowserPushSubscription;
};

export interface RecoveryChannelAdapter {
  channel: RecoveryDeliveryChannel;
  send(input: RecoveryDeliveryInput): Promise<void>;
}

const adapters = new Map<RecoveryDeliveryChannel, RecoveryChannelAdapter>();

export function registerRecoveryChannelAdapter(adapter: RecoveryChannelAdapter) {
  adapters.set(adapter.channel, adapter);
}

export function getActiveRecoveryChannels(): RecoveryDeliveryChannel[] {
  return Array.from(adapters.keys());
}

export async function deliverRecovery(input: RecoveryDeliveryInput) {
  const adapter = adapters.get(input.channel);
  if (!adapter) throw new Error(`RECOVERY_CHANNEL_NOT_ACTIVE:${input.channel}`);
  return adapter.send(input);
}

import webpush from "web-push";
import type { RecoveryChannelAdapter } from "../recovery/channels";

function configureWebPush() {
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT;
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) throw new Error("VAPID_NOT_CONFIGURED");
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export const pushRecoveryAdapter: RecoveryChannelAdapter = {
  channel: "push",
  async send(input) {
    if (!input.pushSubscription) throw new Error("PUSH_SUBSCRIPTION_REQUIRED");
    configureWebPush();
    await webpush.sendNotification(
      input.pushSubscription,
      JSON.stringify({
        title: input.title,
        body: input.body,
        url: input.url,
        icon: "/manus-storage/ravi-pwa-192_4710a701.png",
        badge: "/manus-storage/ravi-pwa-badge-96_183b6baf.png",
        pushId: input.pushId,
        eventToken: input.eventToken,
      }),
      { TTL: 24 * 60 * 60, urgency: "normal" },
    );
  },
};

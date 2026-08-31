export type PushCapability = {
  supported: boolean;
  secureContext: boolean;
  ios: boolean;
  standalone: boolean;
  permission: NotificationPermission | "unsupported";
};

export function getPushCapability(): PushCapability {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const supported =
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  return {
    supported,
    secureContext: window.isSecureContext,
    ios,
    standalone,
    permission: "Notification" in window ? Notification.permission : "unsupported",
  };
}

export function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw.split("").map(char => char.charCodeAt(0)));
}

export async function registerRaviServiceWorker() {
  if (!("serviceWorker" in navigator)) throw new Error("SERVICE_WORKER_UNSUPPORTED");
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function subscribeBrowserToPush(publicKey: string) {
  const capability = getPushCapability();
  if (!capability.supported) throw new Error("PUSH_UNSUPPORTED");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(`PUSH_PERMISSION_${permission.toUpperCase()}`);
  await registerRaviServiceWorker();
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("PUSH_SUBSCRIPTION_INVALID");
  }
  return {
    browserSubscription: subscription,
    payload: {
      endpoint: json.endpoint,
      expirationTime: json.expirationTime ?? null,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    },
  };
}

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

export async function disableRaviPwaForLite() {
  document.querySelectorAll<HTMLLinkElement>('link[rel="manifest"]').forEach(link => link.remove());
  const hadController = Boolean(navigator.serviceWorker?.controller);
  let unregistered = 0;
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      const scriptUrl =
        registration.active?.scriptURL ||
        registration.waiting?.scriptURL ||
        registration.installing?.scriptURL ||
        "";
      if (scriptUrl.endsWith("/sw.js") || registration.scope === `${window.location.origin}/`) {
        if (await registration.unregister()) unregistered += 1;
      }
    }
  }

  let deletedCaches = 0;
  if ("caches" in window) {
    const keys = await caches.keys();
    for (const key of keys) {
      if (/ravi|whatsagent|simulator|pwa/i.test(key) && (await caches.delete(key))) {
        deletedCaches += 1;
      }
    }
  }

  const remainingRegistrations =
    "serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0;
  return { unregistered, deletedCaches, remainingRegistrations, hadController };
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

const RAVI_CACHE = "ravi-shell-v1";
const RAVI_START_URL = "/simulador/ravi";

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(RAVI_CACHE).then(cache => cache.addAll([RAVI_START_URL])));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches
        .keys()
        .then(keys => Promise.all(keys.filter(key => key !== RAVI_CACHE).map(key => caches.delete(key)))),
    ]),
  );
});

async function reportPushEvent(payload, eventType) {
  if (!payload?.pushId || !payload?.eventToken) return;
  try {
    await fetch("/api/public-push/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pushId: payload.pushId,
        eventType,
        eventToken: payload.eventToken,
      }),
    });
  } catch {
    // Tracking não pode impedir a exibição ou abertura da notificação.
  }
}

self.addEventListener("push", event => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = { body: event.data?.text() || "Quer continuar nossa conversa?" };
  }

  const title = data.title || "Ravi • WeDrop";
  const options = {
    body: data.body || "Sua conversa ficou pela metade. Quer continuar?",
    icon: data.icon || "/manus-storage/ravi-pwa-192_4710a701.png",
    badge: data.badge || "/manus-storage/ravi-pwa-badge-96_183b6baf.png",
    tag: data.pushId ? `ravi-${data.pushId}` : "ravi-recovery",
    renotify: false,
    requireInteraction: false,
    data: {
      url: data.url || RAVI_START_URL,
      pushId: data.pushId,
      eventToken: data.eventToken,
    },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      reportPushEvent(data, "delivered"),
    ]),
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = new URL(data.url || RAVI_START_URL, self.location.origin).href;

  event.waitUntil(
    (async () => {
      await reportPushEvent(data, "clicked");
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});

self.addEventListener("fetch", event => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(RAVI_START_URL)));
});

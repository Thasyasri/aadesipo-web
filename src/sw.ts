/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";
import { clientsClaim } from "workbox-core";

declare let self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();

// injectManifest strategy requires this exact call — vite-plugin-pwa
// replaces self.__WB_MANIFEST with the precache list at build time.
precacheAndRoute(self.__WB_MANIFEST);

interface TurnPushPayload {
  title: string;
  body: string;
  roomId?: string;
}

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  let payload: TurnPushPayload;
  try {
    payload = event.data.json() as TurnPushPayload;
  } catch {
    payload = { title: "AadesiPo", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { roomId: payload.roomId },
      tag: payload.roomId ? `turn-${payload.roomId}` : undefined,
    }),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const roomId = (event.notification.data as { roomId?: string } | undefined)?.roomId;
  const targetUrl = roomId ? `/online/${roomId}` : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

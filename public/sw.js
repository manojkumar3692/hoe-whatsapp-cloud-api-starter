/* Push-only worker. Authenticated pages and customer data are never cached. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* Show a generic alert. */ }
  const url = typeof data.url === "string" && /^\/orders(?:\/[a-zA-Z0-9-]+)?$/.test(data.url) ? data.url : "/orders";
  event.waitUntil(self.registration.showNotification(data.title || "New order", {
    body: data.body || "Open the dashboard to review your orders.",
    icon: "/icons/icon-192.png", badge: "/icons/badge.png",
    tag: data.tag || "new-order", data: { url },
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const path = event.notification.data?.url;
  const target = new URL(typeof path === "string" && /^\/orders(?:\/[a-zA-Z0-9-]+)?$/.test(path) ? path : "/orders", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => client.url === target);
    if (existing) return existing.focus();
    return self.clients.openWindow(target);
  })());
});

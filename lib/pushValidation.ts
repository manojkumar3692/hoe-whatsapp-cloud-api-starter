// Accept only browser push services, never arbitrary URLs supplied by a client.
export function isAllowedPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const host = url.hostname;
    return url.protocol === "https:" && !url.username && !url.password && !url.port && (
      host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" ||
      host === "web.push.apple.com" || host.endsWith(".push.apple.com") ||
      host === "notify.windows.com" || host.endsWith(".notify.windows.com")
    );
  } catch { return false; }
}

export function validSubscription(value: unknown): value is { endpoint: string; keys: { p256dh: string; auth: string } } {
  if (!value || typeof value !== "object") return false;
  const sub = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const key = sub.keys?.p256dh;
  const auth = sub.keys?.auth;
  return isAllowedPushEndpoint(sub.endpoint) && typeof key === "string" && /^[A-Za-z0-9_-]{87}=?$/.test(key) &&
    typeof auth === "string" && /^[A-Za-z0-9_-]{22}(==)?$/.test(auth);
}

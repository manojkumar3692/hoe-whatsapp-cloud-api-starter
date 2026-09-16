"use client";

import { useEffect, useState } from "react";

async function saveSubscription(subscription: PushSubscription) {
  const response = await fetch("/api/push/subscriptions", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) throw new Error("Could not enable alerts. Please check the server setup and try again.");
}

export default function PushNotifications() {
  const [ready, setReady] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(false);
  const [message, setMessage] = useState("Checking order alerts…");

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const canPush = window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      setSupported(canPush);
      if (!canPush) {
        setMessage("On iPhone/iPad, add this site to your Home Screen, then open it there. Otherwise use a browser that supports notifications over HTTPS.");
        setReady(true); return;
      }
      try {
        const response = await fetch("/api/push/subscriptions");
        if (!response.ok) throw new Error("Could not check alert settings. Reload to try again.");
        const config = await response.json();
        if (cancelled) return;
        setPublicKey(config.publicKey || "");
        if (!config.configured) { setMessage("Order alerts need server setup before they can be enabled."); return; }
        const registration = await navigator.serviceWorker.getRegistration("/");
        const existing = await registration?.pushManager.getSubscription();
        if (existing && Notification.permission === "granted") {
          await saveSubscription(existing);
          if (!cancelled) { setEnabled(true); setMessage("New paid-order alerts are enabled on this device, including when the dashboard is closed."); }
        } else if (Notification.permission === "denied") {
          setMessage("Notifications are blocked. Allow them in your browser or phone settings, then try again.");
        } else setMessage("Get an alert when a new order is paid, including COD tokens. Abandoned checkouts are excluded.");
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Could not check alert settings.");
      } finally { if (!cancelled) setReady(true); }
    }
    void init();
    return () => { cancelled = true; };
  }, []);

  async function enable() {
    setBusy(true);
    try {
      // Call directly from the tap: iOS requires a user gesture for permission.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error(permission === "denied"
        ? "Notifications are blocked. Allow them in your browser or phone settings."
        : "Permission was not granted. Tap Enable alerts when you are ready.");
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const bytes = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
      const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: bytes,
      });
      await saveSubscription(subscription);
      setEnabled(true);
      setMessage("New paid-order alerts are enabled on this device, including when the dashboard is closed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not enable alerts. Please try again.");
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/push/subscriptions", {
          method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("Could not disable alerts. Please try again.");
        await subscription.unsubscribe();
      }
      setEnabled(false); setMessage("Order alerts are off on this device.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not disable alerts."); }
    finally { setBusy(false); }
  }

  async function test() {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("Order alerts are ready", {
        body: "This is a test on this device. New paid orders will open in the dashboard.",
        icon: "/icons/icon-192.png", tag: "order-alert-test", data: { url: "/orders" },
      });
      setMessage("Test notification shown. This checks this device; new-order delivery also needs the server webhook.");
    } catch { setMessage("Could not show a test. Check notification permissions in your phone settings."); }
  }

  return <details className="notification-control">
    <summary>Order alerts{enabled ? " · On" : ""}</summary>
    <p role="status" aria-live="polite">{message}</p>
    {ready && supported && publicKey && <div className="notification-actions">
      <button type="button" disabled={busy} onClick={enabled ? disable : enable}>{busy ? "Please wait…" : enabled ? "Disable alerts" : "Enable alerts"}</button>
      {enabled && <button type="button" disabled={busy} onClick={test}>Test this device</button>}
    </div>}
    <p>iPhone/iPad: Share → Add to Home Screen → open the app → Enable alerts.</p>
  </details>;
}

import webpush from "web-push";
import { supabaseAdmin } from "./supabaseAdmin";
import { isAllowedPushEndpoint } from "./pushValidation";

export function pushConfigured() {
  return !!(process.env.WEB_PUSH_PUBLIC_KEY && process.env.WEB_PUSH_PRIVATE_KEY && process.env.WEB_PUSH_SUBJECT);
}

export async function dispatchOrderPush() {
  if (!pushConfigured()) throw new Error("Push notifications are not configured");
  const db = supabaseAdmin();
  // Atomic claims prevent overlapping webhook/cron requests from processing
  // the same event. An expired lease allows a terminated worker to retry.
  const { data: events, error } = await db.rpc("claim_order_push_events");
  if (error) throw error;
  let delivered = 0;
  let retried = 0;
  for (const event of events || []) {
    let failed = false;
    try {
      const { data: order, error: orderError } = await db.from("orders")
        .select("id,order_number,payment_status,is_hidden").eq("id", event.order_id).maybeSingle();
      if (orderError) throw orderError;
      if (order && order.payment_status === "paid" && !order.is_hidden) {
        // Subscriptions created after the order do not receive historical alerts.
        // Expiring subscriptions are renewed only by an authenticated visit.
        const { data: subscriptions, error: subError } = await db.from("push_subscriptions")
          .select("endpoint,keys").lte("created_at", event.created_at).gt("expires_at", new Date().toISOString());
        if (subError) throw subError;
        const { data: receipts, error: receiptError } = await db.from("order_push_receipts")
          .select("endpoint").eq("event_id", event.id);
        if (receiptError) throw receiptError;
        const sent = new Set((receipts || []).map(row => row.endpoint));
        const pending = (subscriptions || []).filter(sub => !sent.has(sub.endpoint));
        // Small parallel batches keep one slow push provider from blocking others.
        for (let offset = 0; offset < pending.length; offset += 10) {
          await Promise.all(pending.slice(offset, offset + 10).map(async sub => {
            try {
              if (!isAllowedPushEndpoint(sub.endpoint)) throw new Error("Invalid endpoint");
              await webpush.sendNotification(sub, JSON.stringify({
                title: "New paid order",
                body: `Order ${order.order_number} is ready to review.`,
                url: `/orders/${order.id}`,
                tag: `order-${order.id}`,
              }), {
                vapidDetails: { subject: process.env.WEB_PUSH_SUBJECT!, publicKey: process.env.WEB_PUSH_PUBLIC_KEY!, privateKey: process.env.WEB_PUSH_PRIVATE_KEY! },
                TTL: 3600, urgency: "high", timeout: 5000,
              });
              const { error: saveError } = await db.from("order_push_receipts")
                .upsert({ event_id: event.id, endpoint: sub.endpoint }, { onConflict: "event_id,endpoint" });
              if (saveError) throw saveError;
              delivered++;
            } catch (error) {
              const status = (error as { statusCode?: number }).statusCode;
              if (status === 404 || status === 410) {
                const { error: deleteError } = await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
                if (deleteError) failed = true;
              } else failed = true;
            }
          }));
        }
      }
    } catch { failed = true; }
    const { error: finishError } = await db.from("order_push_events").update({
      status: failed ? (event.attempts >= 8 ? "failed" : "pending") : "sent",
      available_at: new Date(Date.now() + Math.min(3600, 30 * 2 ** event.attempts) * 1000).toISOString(),
      last_error: failed ? "One or more push deliveries failed" : null,
    }).eq("id", event.id).eq("attempts", event.attempts);
    if (finishError) throw finishError;
    if (failed) retried++;
  }
  return { processed: (events || []).length, delivered, retried };
}

import { supabaseAdmin } from "./supabaseAdmin";
import { isShiprocketEnabled, mapShiprocketStatus, ShiprocketTrackingResult, trackShiprocketOrder, trackShiprocketWaybills } from "./shiprocket";
import { ORDER_STATUS_ADMIN_LOCKED, SYNC_TERMINAL_STATUSES, shouldAdvanceOrderStatus } from "./orderStatusSync";

const AUTO_SYNC_STALE_AFTER_MS = 5 * 60 * 1000;

export function isShiprocketSyncDue(order: {
  shiprocket_waybill: string | null;
  shipping_status: string;
  shiprocket_last_synced_at: string | null;
}): boolean {
  if (!isShiprocketEnabled()) return false;
  if (!order.shiprocket_waybill) return false;
  if (SYNC_TERMINAL_STATUSES.includes(order.shipping_status)) return false;
  if (!order.shiprocket_last_synced_at) return true;
  return Date.now() - new Date(order.shiprocket_last_synced_at).getTime() > AUTO_SYNC_STALE_AFTER_MS;
}

export type ShiprocketSyncResult = {
  synced: boolean;
  statusChanged: boolean;
  newStatus?: string;
  rawStatus?: string;
  syncedAt?: string;
  error?: string;
};

async function applyShipmentToOrder(
  supabase: ReturnType<typeof supabaseAdmin>,
  order: { id: string; shipping_status: string; payment_status: string; payment_type: string; cod_balance_status: string },
  result: ShiprocketTrackingResult
): Promise<ShiprocketSyncResult> {
  const tracking = result.tracking_data;
  if (!tracking || tracking.track_status === 0) {
    return { synced: false, statusChanged: false, error: tracking?.error || "Shiprocket has no tracking activity for this AWB yet" };
  }

  const shipment = tracking.shipment_track?.[0];
  const latestActivity = tracking.shipment_track_activities?.[0];
  const rawStatus = shipment?.current_status || latestActivity?.["sr-status-label"] || latestActivity?.activity || "";
  const mappedStatus = mapShiprocketStatus(rawStatus);
  const now = new Date().toISOString();
  const updatePayload: any = {
    shiprocket_last_status_raw: rawStatus || null,
    shiprocket_last_synced_at: now,
    shiprocket_courier_name: shipment?.courier_name || null,
    shiprocket_tracking_url: tracking.track_url || null,
    updated_at: now,
  };
  const trackedAwb = shipment?.awb_code?.trim();
  if (trackedAwb) updatePayload.shiprocket_waybill = trackedAwb;

  const completesCod = mappedStatus === "delivered"
    && order.payment_status === "paid"
    && order.payment_type === "partial_cod"
    && order.cod_balance_status === "pending";
  const targetStatus = completesCod ? "completed" : mappedStatus;
  if (completesCod) updatePayload.cod_balance_status = "collected";

  const statusChanged = !!targetStatus
    && targetStatus !== order.shipping_status
    && shouldAdvanceOrderStatus(order.shipping_status, targetStatus);
  if (statusChanged) updatePayload.shipping_status = targetStatus;

  const { error } = await supabase.from("orders").update(updatePayload).eq("id", order.id);
  if (error) return { synced: false, statusChanged: false, error: error.message };

  const locationSuffix = latestActivity?.location && latestActivity.location !== "NA"
    ? ` at ${latestActivity.location}`
    : "";
  let note: string;
  if (completesCod && statusChanged) {
    note = `Synced from Shiprocket: "${rawStatus}"${locationSuffix} — COD balance assumed collected and order completed`;
  } else if (statusChanged) {
    note = `Synced from Shiprocket: "${rawStatus}"${locationSuffix}`;
  } else if (mappedStatus && ORDER_STATUS_ADMIN_LOCKED.includes(order.shipping_status)) {
    note = `Delivery Status updated to "${rawStatus}"${locationSuffix} — Order Status left as "${order.shipping_status}" (admin-set, not overridden)`;
  } else if (mappedStatus) {
    note = `Delivery Status updated to "${rawStatus}"${locationSuffix} — Order Status unchanged`;
  } else {
    note = `Delivery Status updated to "${rawStatus}"${locationSuffix} — not auto-mapped to an Order Status, review manually`;
  }
  await supabase.from("order_status_history").insert({
    order_id: order.id,
    status: statusChanged ? targetStatus! : order.shipping_status,
    note,
  });

  return { synced: true, statusChanged, newStatus: statusChanged ? targetStatus! : order.shipping_status, rawStatus, syncedAt: now };
}

export type ShiprocketBulkSyncResult = { checked: number; matched: number; updated: number; skipped?: boolean; error?: string };

export async function bulkSyncShiprocketStatuses(options: { staleOnly?: boolean } = {}): Promise<ShiprocketBulkSyncResult> {
  if (!isShiprocketEnabled()) return { checked: 0, matched: 0, updated: 0, skipped: true };
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("orders")
    .select("id, shipping_status, payment_status, payment_type, cod_balance_status, shiprocket_waybill, shiprocket_last_synced_at")
    .eq("is_hidden", false)
    .not("shiprocket_waybill", "is", null);
  if (error) return { checked: 0, matched: 0, updated: 0, error: error.message };

  const allOrders = data || [];
  const staleCutoff = Date.now() - AUTO_SYNC_STALE_AFTER_MS;
  const orders = allOrders.filter((order) =>
    !SYNC_TERMINAL_STATUSES.includes(order.shipping_status)
    && (!options.staleOnly || !order.shiprocket_last_synced_at || new Date(order.shiprocket_last_synced_at).getTime() < staleCutoff)
  );
  const counts = new Map<string, number>();
  for (const order of allOrders) {
    if (order.shiprocket_waybill) counts.set(order.shiprocket_waybill, (counts.get(order.shiprocket_waybill) || 0) + 1);
  }

  let matched = 0;
  let updated = 0;
  try {
    for (let index = 0; index < orders.length; index += 50) {
      const batch = orders.slice(index, index + 50);
      const shipments = await trackShiprocketWaybills(batch.map((order) => order.shiprocket_waybill!));
      await Promise.all(batch.map(async (order) => {
        if ((counts.get(order.shiprocket_waybill!) || 0) > 1) return;
        const shipment = shipments[order.shiprocket_waybill!];
        if (!shipment) return;
        matched++;
        const sync = await applyShipmentToOrder(supabase, order, shipment);
        if (sync.synced) updated++;
      }));
    }
    return { checked: orders.length, matched, updated };
  } catch (error: any) {
    return { checked: orders.length, matched, updated, error: error.message || "Shiprocket bulk sync failed" };
  }
}

export async function syncOrderShiprocketStatus(orderId: string): Promise<ShiprocketSyncResult> {
  if (!isShiprocketEnabled()) {
    return { synced: false, statusChanged: false, error: "Shiprocket integration is currently on hold" };
  }
  const supabase = supabaseAdmin();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, order_number, shipping_status, payment_status, payment_type, cod_balance_status, shiprocket_waybill")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !order) return { synced: false, statusChanged: false, error: error?.message || "Order not found" };
  try {
    let shipment: ShiprocketTrackingResult | null | undefined;
    if (order.shiprocket_waybill) {
      const shipments = await trackShiprocketWaybills([order.shiprocket_waybill]);
      shipment = shipments[order.shiprocket_waybill];
    } else {
      shipment = await trackShiprocketOrder(order.order_number);
    }
    if (!shipment) {
      const reference = order.shiprocket_waybill
        ? `AWB ${order.shiprocket_waybill}`
        : `order ID ${order.order_number}`;
      return { synced: false, statusChanged: false, error: `Shiprocket has no record of ${reference}` };
    }
    return await applyShipmentToOrder(supabase, order, shipment);
  } catch (error: any) {
    return { synced: false, statusChanged: false, error: error.message || "Shiprocket sync failed" };
  }
}

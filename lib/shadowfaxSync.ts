import { supabaseAdmin } from "./supabaseAdmin";
import { trackShadowfaxWaybills, mapShadowfaxStatus, ShadowfaxOrderDetail } from "./shadowfax";
import { ORDER_STATUS_ADMIN_LOCKED, SYNC_TERMINAL_STATUSES, shouldAdvanceOrderStatus } from "./orderStatusSync";

// Same pattern as lib/delhiverySync.ts — see that file for the fuller
// explanation of the sticky-cancel / forward-only Order Status rules
// (shared via lib/orderStatusSync.ts). No bulk "match by Order ID"
// backfill here: Shadowfax's tracking API only accepts AWB numbers as
// input, unlike Delhivery's ref_nos — see lib/shadowfax.ts for details.

const AUTO_SYNC_STALE_AFTER_MS = 5 * 60 * 1000;

export function isShadowfaxSyncDue(order: {
  shadowfax_waybill: string | null;
  shipping_status: string;
  shadowfax_last_synced_at: string | null;
}): boolean {
  if (!order.shadowfax_waybill) return false;
  if (SYNC_TERMINAL_STATUSES.includes(order.shipping_status)) return false;
  if (!order.shadowfax_last_synced_at) return true;

  const age = Date.now() - new Date(order.shadowfax_last_synced_at).getTime();
  return age > AUTO_SYNC_STALE_AFTER_MS;
}

export type ShadowfaxSyncResult = {
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
  shipment: ShadowfaxOrderDetail
): Promise<ShadowfaxSyncResult> {
  const rawStatus = shipment.status_display || shipment.status || "";
  const mappedStatus = mapShadowfaxStatus(shipment.status);
  const now = new Date().toISOString();

  const updatePayload: any = {
    shadowfax_last_status_raw: rawStatus || null,
    shadowfax_last_synced_at: now,
    updated_at: now,
  };

  const completesCod = mappedStatus === "delivered"
    && order.payment_status === "paid"
    && order.payment_type === "partial_cod"
    && order.cod_balance_status === "pending";
  const targetStatus = completesCod ? "completed" : mappedStatus;
  if (completesCod) updatePayload.cod_balance_status = "collected";

  const statusChanged =
    !!targetStatus &&
    targetStatus !== order.shipping_status &&
    shouldAdvanceOrderStatus(order.shipping_status, targetStatus);
  if (statusChanged) {
    updatePayload.shipping_status = targetStatus;
  }

  const { error: updateError } = await supabase.from("orders").update(updatePayload).eq("id", order.id);

  if (updateError) {
    return { synced: false, statusChanged: false, error: updateError.message };
  }

  const latestEvent = (shipment.tracking_details || [])[shipment.tracking_details!.length - 1];
  const locationSuffix = latestEvent?.location ? ` at ${latestEvent.location}` : "";

  let historyNote: string;
  if (completesCod && statusChanged) {
    historyNote = `Synced from Shadowfax: "${rawStatus}"${locationSuffix} — COD balance assumed collected and order completed`;
  } else if (statusChanged) {
    historyNote = `Synced from Shadowfax: "${rawStatus}"${locationSuffix}`;
  } else if (mappedStatus && ORDER_STATUS_ADMIN_LOCKED.includes(order.shipping_status)) {
    historyNote = `Delivery Status updated to "${rawStatus}"${locationSuffix} — Order Status left as "${order.shipping_status}" (admin-set, not overridden)`;
  } else if (mappedStatus) {
    historyNote = `Delivery Status updated to "${rawStatus}"${locationSuffix} — Order Status unchanged`;
  } else {
    historyNote = `Delivery Status updated to "${rawStatus}"${locationSuffix} — not auto-mapped to an Order Status, review manually`;
  }

  await supabase.from("order_status_history").insert({
    order_id: order.id,
    status: statusChanged ? targetStatus! : order.shipping_status,
    note: historyNote,
  });

  return {
    synced: true,
    statusChanged,
    newStatus: statusChanged ? targetStatus! : order.shipping_status,
    rawStatus,
    syncedAt: now,
  };
}

export type ShadowfaxBulkSyncResult = {
  checked: number;
  matched: number;
  updated: number;
  error?: string;
};

export async function bulkSyncShadowfaxStatuses(options: { staleOnly?: boolean } = {}): Promise<ShadowfaxBulkSyncResult> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("orders")
    .select("id, shipping_status, payment_status, payment_type, cod_balance_status, shadowfax_waybill, shadowfax_last_synced_at")
    .eq("is_hidden", false)
    .not("shadowfax_waybill", "is", null);

  if (error) return { checked: 0, matched: 0, updated: 0, error: error.message };

  const allTrackedOrders = data || [];
  const staleCutoff = Date.now() - AUTO_SYNC_STALE_AFTER_MS;
  const orders = allTrackedOrders.filter(
    (order) => !SYNC_TERMINAL_STATUSES.includes(order.shipping_status)
      && (!options.staleOnly || !order.shadowfax_last_synced_at || new Date(order.shadowfax_last_synced_at).getTime() < staleCutoff)
  );
  const awbUseCount = new Map<string, number>();
  for (const order of allTrackedOrders) {
    if (order.shadowfax_waybill) {
      awbUseCount.set(order.shadowfax_waybill, (awbUseCount.get(order.shadowfax_waybill) || 0) + 1);
    }
  }
  let matched = 0;
  let updated = 0;

  try {
    for (let i = 0; i < orders.length; i += 50) {
      const batch = orders.slice(i, i + 50);
      const shipments = await trackShadowfaxWaybills(batch.map((order) => order.shadowfax_waybill!));
      await Promise.all(batch.map(async (order) => {
        if ((awbUseCount.get(order.shadowfax_waybill!) || 0) > 1) return;
        const shipment = shipments[order.shadowfax_waybill!];
        if (!shipment) return;
        matched++;
        const result = await applyShipmentToOrder(supabase, order, shipment);
        if (result.synced) updated++;
      }));
    }
    return { checked: orders.length, matched, updated };
  } catch (error: any) {
    return { checked: orders.length, matched, updated, error: error.message || "Shadowfax bulk sync failed" };
  }
}

export async function syncOrderShadowfaxStatus(orderId: string): Promise<ShadowfaxSyncResult> {
  const supabase = supabaseAdmin();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, shipping_status, payment_status, payment_type, cod_balance_status, shadowfax_waybill")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) {
    return { synced: false, statusChanged: false, error: orderError?.message || "Order not found" };
  }

  if (!order.shadowfax_waybill) {
    return { synced: false, statusChanged: false, error: "No Shadowfax waybill saved on this order yet" };
  }

  try {
    const results = await trackShadowfaxWaybills([order.shadowfax_waybill]);
    const shipment = results[order.shadowfax_waybill];

    if (!shipment) {
      return {
        synced: false,
        statusChanged: false,
        error: `Shadowfax has no record of AWB ${order.shadowfax_waybill}`,
      };
    }

    return await applyShipmentToOrder(supabase, order, shipment);
  } catch (e: any) {
    return { synced: false, statusChanged: false, error: e.message || "Shadowfax sync failed" };
  }
}

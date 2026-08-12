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
  order: { id: string; shipping_status: string },
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

  const statusChanged =
    !!mappedStatus &&
    mappedStatus !== order.shipping_status &&
    shouldAdvanceOrderStatus(order.shipping_status, mappedStatus);
  if (statusChanged) {
    updatePayload.shipping_status = mappedStatus;
  }

  const { error: updateError } = await supabase.from("orders").update(updatePayload).eq("id", order.id);

  if (updateError) {
    return { synced: false, statusChanged: false, error: updateError.message };
  }

  const latestEvent = (shipment.tracking_details || [])[shipment.tracking_details!.length - 1];
  const locationSuffix = latestEvent?.location ? ` at ${latestEvent.location}` : "";

  let historyNote: string;
  if (statusChanged) {
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
    status: statusChanged ? mappedStatus! : order.shipping_status,
    note: historyNote,
  });

  return {
    synced: true,
    statusChanged,
    newStatus: statusChanged ? mappedStatus! : order.shipping_status,
    rawStatus,
    syncedAt: now,
  };
}

export async function syncOrderShadowfaxStatus(orderId: string): Promise<ShadowfaxSyncResult> {
  const supabase = supabaseAdmin();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, shipping_status, shadowfax_waybill")
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

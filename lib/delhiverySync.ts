import { supabaseAdmin } from "./supabaseAdmin";
import { trackWaybills, trackByReferenceNumbersRaw, mapDelhiveryStatus, DelhiveryShipment } from "./delhivery";

// Once an order reaches one of these, there's nothing left to track —
// don't keep spending API calls checking on it.
export const DELHIVERY_TERMINAL_STATUSES = [
  "delivered",
  "completed",
  "cancelled",
  "returned",
  "refunded",
  "rejected",
];

// How long a synced status is considered fresh enough that loading the
// order page again won't trigger another Delhivery call. Keeps repeated
// page views cheap and respects Delhivery's rate limit (750 req/5min/IP)
// instead of firing a request on every single click. The manual "Sync Now"
// button bypasses this and always forces a fresh call.
const AUTO_SYNC_STALE_AFTER_MS = 5 * 60 * 1000;

export function isDelhiverySyncDue(order: {
  delhivery_waybill: string | null;
  shipping_status: string;
  delhivery_last_synced_at: string | null;
}): boolean {
  if (!order.delhivery_waybill) return false;
  if (DELHIVERY_TERMINAL_STATUSES.includes(order.shipping_status)) return false;
  if (!order.delhivery_last_synced_at) return true;

  const age = Date.now() - new Date(order.delhivery_last_synced_at).getTime();
  return age > AUTO_SYNC_STALE_AFTER_MS;
}

export type DelhiverySyncResult = {
  synced: boolean;
  statusChanged: boolean;
  newStatus?: string;
  rawStatus?: string;
  syncedAt?: string;
  error?: string;
};

// "Order Status" (shipping_status) is an admin-owned decision — Delhivery
// sync should only ever move it FORWARD along the normal fulfillment path,
// and should never touch it once it's in one of these locked/terminal
// states. If you cancel an order, it stays cancelled no matter what
// Delhivery reports afterwards. "Delivery Status" (delhivery_last_status_raw)
// is the separate, always-updated, read-only field that mirrors Delhivery's
// own reporting regardless of what Order Status says — see
// shouldAdvanceOrderStatus below.
const ORDER_STATUS_FORWARD_SEQUENCE = [
  "pending",
  "confirmed",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "completed",
];

const ORDER_STATUS_ADMIN_LOCKED = ["cancelled", "returned", "refunded", "rejected"];

function shouldAdvanceOrderStatus(currentStatus: string, mappedStatus: string): boolean {
  // Once an admin has made a final call (cancelled, refunded, etc.), a
  // Delhivery sync should never overwrite it — it only keeps updating the
  // separate Delivery Status field from here on.
  if (ORDER_STATUS_ADMIN_LOCKED.includes(currentStatus)) return false;

  // A real-world RTO or lost-package report from Delhivery is worth acting
  // on even though it isn't "forward" progress in the happy-path sequence.
  if (mappedStatus === "returned" || mappedStatus === "cancelled") return true;

  const currentIndex = ORDER_STATUS_FORWARD_SEQUENCE.indexOf(currentStatus);
  const mappedIndex = ORDER_STATUS_FORWARD_SEQUENCE.indexOf(mappedStatus);
  if (mappedIndex === -1) return false; // unrecognized target, don't touch

  return mappedIndex > currentIndex;
}

// Shared apply-step: given a shipment record from Delhivery (found either
// by waybill or by reference number) and the order it belongs to, updates
// Delivery Status (always) and Order Status (only per shouldAdvanceOrderStatus),
// backfills delhivery_waybill if we didn't have one yet (i.e. this order was
// matched purely by reference number), and logs a timeline entry. Used by
// both the single-order sync and the bulk by-reference-number sync.
async function applyShipmentToOrder(
  supabase: ReturnType<typeof supabaseAdmin>,
  order: { id: string; shipping_status: string; delhivery_waybill: string | null },
  shipment: DelhiveryShipment
): Promise<DelhiverySyncResult> {
  const rawStatus = shipment.Status?.Status || "";
  const mappedStatus = mapDelhiveryStatus(rawStatus);
  const now = new Date().toISOString();

  const updatePayload: any = {
    delhivery_last_status_raw: rawStatus || null,
    delhivery_last_synced_at: now,
    updated_at: now,
  };

  // Discovered a waybill for an order that didn't have one saved yet —
  // this is exactly the case where the order was only ever matched via
  // Delhivery's reference-number lookup (our order_number), and we're now
  // filling in the real AWB for future single-order syncs too.
  const waybillBackfilled = !order.delhivery_waybill && !!shipment.AWB;
  if (waybillBackfilled) {
    updatePayload.delhivery_waybill = shipment.AWB;
  }

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

  const locationSuffix = shipment.Status?.StatusLocation ? ` at ${shipment.Status.StatusLocation}` : "";
  const waybillSuffix = waybillBackfilled ? ` (waybill ${shipment.AWB} matched via order ID)` : "";
  let historyNote: string;
  if (statusChanged) {
    historyNote = `Synced from Delhivery: "${rawStatus}"${locationSuffix}${waybillSuffix}`;
  } else if (mappedStatus && ORDER_STATUS_ADMIN_LOCKED.includes(order.shipping_status)) {
    historyNote = `Delivery Status updated to "${rawStatus}"${locationSuffix}${waybillSuffix} — Order Status left as "${order.shipping_status}" (admin-set, not overridden)`;
  } else if (mappedStatus) {
    historyNote = `Delivery Status updated to "${rawStatus}"${locationSuffix}${waybillSuffix} — Order Status unchanged`;
  } else {
    historyNote = `Delivery Status updated to "${rawStatus}"${locationSuffix}${waybillSuffix} — not auto-mapped to an Order Status, review manually`;
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

// Does the actual work: calls Delhivery for one order's waybill, updates
// shipping_status if we can confidently map the result, always records the
// raw status + sync time, and logs a timeline entry. Shared by the manual
// "Sync Now" button (route) and the automatic on-page-load sync below.
export async function syncOrderDelhiveryStatus(orderId: string): Promise<DelhiverySyncResult> {
  const supabase = supabaseAdmin();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, shipping_status, delhivery_waybill")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) {
    return { synced: false, statusChanged: false, error: orderError?.message || "Order not found" };
  }

  if (!order.delhivery_waybill) {
    return { synced: false, statusChanged: false, error: "No Delhivery waybill saved on this order yet" };
  }

  try {
    const results = await trackWaybills([order.delhivery_waybill]);
    const shipment = results[order.delhivery_waybill];

    if (!shipment) {
      return {
        synced: false,
        statusChanged: false,
        error: `Delhivery has no record of waybill ${order.delhivery_waybill}`,
      };
    }

    return await applyShipmentToOrder(supabase, order, shipment);
  } catch (e: any) {
    return { synced: false, statusChanged: false, error: e.message || "Delhivery sync failed" };
  }
}

export type BulkReferenceSyncResult = {
  checked: number;
  matched: number;
  updated: number;
  unmatchedOrderNumbers: string[];
  // Diagnostics for when matching isn't working as expected — a sample of
  // the exact ReferenceNo strings Delhivery actually returned for this
  // batch, and how many shipments came back in total. Compare these against
  // your order numbers to spot formatting mismatches (case, whitespace,
  // extra characters) if matches are lower than expected.
  totalShipmentsReturned: number;
  sampleReturnedReferenceNumbers: string[];
  error?: string;
};

function normalizeRef(s: string): string {
  return (s || "").trim().toUpperCase();
}

// Matches orders to Delhivery shipments by ORDER NUMBER instead of waybill —
// for use when shipments were created in Delhivery One using this app's
// order_number as the "Order ID" / reference number field, rather than
// pasting the resulting AWB back into this app one order at a time. Finds
// every non-hidden order missing a waybill, looks them up in Delhivery in
// batches, and for every match: backfills delhivery_waybill with the real
// AWB (so future single-order syncs work off the waybill directly), and
// applies the same Delivery Status / Order Status update rules as a normal
// sync. Orders Delhivery has no record of are left untouched and listed in
// unmatchedOrderNumbers so you know which still need attention. Matching is
// case/whitespace-insensitive since Delhivery's own dashboard input isn't
// guaranteed to preserve exact casing.
export async function bulkSyncOrdersByOrderNumber(): Promise<BulkReferenceSyncResult> {
  const supabase = supabaseAdmin();

  const { data: candidates, error: fetchError } = await supabase
    .from("orders")
    .select("id, order_number, shipping_status, delhivery_waybill")
    .eq("is_hidden", false)
    .is("delhivery_waybill", null)
    .not("order_number", "is", null);

  const emptyDiagnostics = { totalShipmentsReturned: 0, sampleReturnedReferenceNumbers: [] };

  if (fetchError) {
    return { checked: 0, matched: 0, updated: 0, unmatchedOrderNumbers: [], ...emptyDiagnostics, error: fetchError.message };
  }

  const orders = candidates || [];
  if (orders.length === 0) {
    return { checked: 0, matched: 0, updated: 0, unmatchedOrderNumbers: [], ...emptyDiagnostics };
  }

  // Batch to keep each request comfortably within Delhivery's rate limit
  // (750 req/5min/IP) and response size.
  const BATCH_SIZE = 50;
  let matched = 0;
  let updated = 0;
  let totalShipmentsReturned = 0;
  const sampleReturnedReferenceNumbers: string[] = [];
  const unmatchedOrderNumbers: string[] = [];

  try {
    for (let i = 0; i < orders.length; i += BATCH_SIZE) {
      const batch = orders.slice(i, i + BATCH_SIZE);
      const shipments = await trackByReferenceNumbersRaw(batch.map((o) => o.order_number));

      totalShipmentsReturned += shipments.length;
      for (const s of shipments) {
        if (sampleReturnedReferenceNumbers.length < 10 && s.ReferenceNo) {
          sampleReturnedReferenceNumbers.push(s.ReferenceNo);
        }
      }

      const byNormalizedRefNo: Record<string, DelhiveryShipment> = {};
      for (const s of shipments) {
        if (s.ReferenceNo) byNormalizedRefNo[normalizeRef(s.ReferenceNo)] = s;
      }

      for (const order of batch) {
        const shipment = byNormalizedRefNo[normalizeRef(order.order_number)];
        if (!shipment) {
          unmatchedOrderNumbers.push(order.order_number);
          continue;
        }
        matched++;
        const result = await applyShipmentToOrder(supabase, order, shipment);
        if (result.synced) updated++;
      }
    }
  } catch (e: any) {
    return {
      checked: orders.length,
      matched,
      updated,
      unmatchedOrderNumbers,
      totalShipmentsReturned,
      sampleReturnedReferenceNumbers,
      error: e.message || "Delhivery bulk sync failed",
    };
  }

  return {
    checked: orders.length,
    matched,
    updated,
    unmatchedOrderNumbers,
    totalShipmentsReturned,
    sampleReturnedReferenceNumbers,
  };
}

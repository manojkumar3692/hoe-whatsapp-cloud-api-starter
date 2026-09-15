// Shared rules for how a courier sync (Delhivery, Shiprocket, or any future
// one) is allowed to touch "Order Status" (orders.shipping_status).
//
// Order Status is an admin-owned decision — a courier sync should only
// ever move it FORWARD along the normal fulfillment path, and should never
// touch it once it's in one of the locked/terminal states below. If you
// cancel an order, it stays cancelled no matter what any courier reports
// afterwards. "Delivery Status" (each courier's own *_last_status_raw
// column) is the separate, always-updated, read-only field that mirrors
// the courier's own reporting regardless of what Order Status says.
//
// Used by both lib/delhiverySync.ts and lib/shiprocketSync.ts so an order
// gets identical sticky-cancel/forward-only treatment no matter which
// courier is attached to it.

export const ORDER_STATUS_FORWARD_SEQUENCE = [
  "pending",
  "confirmed",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "completed",
];

export const ORDER_STATUS_ADMIN_LOCKED = [
  "cancelled",
  "delivery_disputed",
  "returned",
  "refunded",
  "rejected",
];

// Once an order reaches one of these, there's nothing left to track for
// ANY courier — don't keep spending API calls checking on it.
export const SYNC_TERMINAL_STATUSES = [...ORDER_STATUS_ADMIN_LOCKED, "delivered", "completed"];

export function shouldAdvanceOrderStatus(currentStatus: string, mappedStatus: string): boolean {
  // Once an admin has made a final call (cancelled, refunded, etc.), a
  // courier sync should never overwrite it — it only keeps updating the
  // separate Delivery Status field from here on.
  if (ORDER_STATUS_ADMIN_LOCKED.includes(currentStatus)) return false;

  // A real-world RTO or lost-package report is worth acting on even though
  // it isn't "forward" progress in the happy-path sequence.
  if (mappedStatus === "returned" || mappedStatus === "cancelled") return true;

  const currentIndex = ORDER_STATUS_FORWARD_SEQUENCE.indexOf(currentStatus);
  const mappedIndex = ORDER_STATUS_FORWARD_SEQUENCE.indexOf(mappedStatus);
  if (mappedIndex === -1) return false; // unrecognized target, don't touch

  return mappedIndex > currentIndex;
}

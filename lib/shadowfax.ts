// Shadowfax shipment tracking client (Unified API, Pull/tracking side).
//
// Docs: https://sfxunifiedapi.docs.apiary.io/
//   Auth header: Authorization: Token <token>
//   Base URL (prod): https://dale.shadowfax.in/api
//   Multiple Order Details v4: POST /v4/clients/bulk_track/
//     body { awb_numbers: string[] } (max 50), returns { message, data: [...] }
//   Single Order Details v4: GET /v4/clients/orders/{awb_number}/track/
//
// Important limitation (unlike Delhivery): Shadowfax's tracking endpoints
// only accept AWB numbers as input — there is no equivalent of Delhivery's
// ref_nos lookup-by-client-order-id for tracking. client_order_id comes
// back in the response (so you can cross-check), but you can't search
// Shadowfax for "everything matching order HOE-...". That means there's no
// way to build a bulk "match by Order ID" backfill button for Shadowfax
// like the one on /orders for Delhivery — AWBs have to be entered per
// order (manually, or via a CSV export from Shadowfax's own dashboard).

const BASE_URL = process.env.SHADOWFAX_BASE_URL || "https://dale.shadowfax.in/api";

export type ShadowfaxTrackingEvent = {
  created: string;
  location: string;
  status_id: string;
  status: string;
  remarks: string;
  awb_number: string;
};

export type ShadowfaxOrderDetail = {
  id: number;
  client_order_id: string;
  awb_number: string;
  status: string; // status_id, e.g. "delivered"
  status_display: string; // human label, e.g. "Delivered to customer"
  order_date?: string;
  tracking_details?: ShadowfaxTrackingEvent[];
};

// Tracks up to 50 waybills in one request. Returns a map of
// awb_number -> order detail (missing/unrecognized AWBs just won't be in
// the map, not an error).
export async function trackShadowfaxWaybills(
  awbNumbers: string[]
): Promise<Record<string, ShadowfaxOrderDetail>> {
  const token = process.env.SHADOWFAX_API_TOKEN;

  if (!token) {
    throw new Error("Missing SHADOWFAX_API_TOKEN env var");
  }

  const clean = [...new Set(awbNumbers.map((w) => w.trim()).filter(Boolean))];
  if (clean.length === 0) return {};

  if (clean.length > 50) {
    throw new Error("Shadowfax bulk_track supports at most 50 AWBs per call");
  }

  const res = await fetch(`${BASE_URL}/v4/clients/bulk_track/`, {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ awb_numbers: clean }),
  });

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Shadowfax returned non-JSON response (status ${res.status}): ${text.slice(0, 300)}`);
  }

  if (!res.ok) {
    throw new Error(typeof json === "string" ? json : JSON.stringify(json));
  }

  const list: ShadowfaxOrderDetail[] = json?.data || [];
  const byAwb: Record<string, ShadowfaxOrderDetail> = {};

  for (const order of list) {
    if (order?.awb_number) {
      byAwb[order.awb_number] = order;
    }
  }

  return byAwb;
}

// Maps Shadowfax's status_id (exact, machine-readable — unlike Delhivery's
// free-text status this doesn't need fuzzy matching) to this app's
// shipping_status vocabulary. Covers both the Marketplace and Warehouse
// order-state vocabularies since both funnel through the same tracking
// response shape. Returns null for anything ambiguous (on_hold, not
// contactable, delay requests, etc.) so callers leave shipping_status
// untouched rather than guess wrong — the raw status_id + display text is
// always stored separately in shadowfax_last_status_raw.
const STATUS_MAP: Record<string, string | null> = {
  // Confirmed / not yet moving
  new: "confirmed",

  // Picked up and moving through the Shadowfax network
  assigned_for_seller_pickup: "shipped",
  ofp: "shipped",
  picked: "shipped",
  recd_at_rev_hub: "shipped",
  recd_at_fwd_hub: "shipped",
  recd_at_fwd_dc: "shipped",
  item_manifested: "shipped",
  bag_in_transit: "shipped",
  bag_received: "shipped",
  bag_received_at_via: "shipped",
  received_from_client_warehouse: "shipped",

  // Out for delivery
  assigned_for_delivery: "out_for_delivery",
  ofd: "out_for_delivery",

  // Delivered
  delivered: "delivered",

  // Cancelled
  cancelled_by_customer: "cancelled",
  cancelled_by_seller: "cancelled",
  lost: "cancelled",

  // Return in progress — mirrors our own "return_requested" status
  rts: "return_requested",
  rto: "return_requested",

  // Fully returned to seller/client
  rts_d: "returned",
  rto_d: "returned",

  // Everything else (on_hold, pickup_on_hold, nc, na, cid,
  // seller_initiated_delay, seller_not_contactable, pickup_not_attempted,
  // reopen_ndr, pincode_updated, item_misrouted, rts_in_process, rts_ofd,
  // rts_nd, rto_in_process, rto_nd, in_transit_return) is ambiguous enough
  // to leave for manual review rather than guess — falls through to the
  // `undefined` default below, treated the same as null.
};

export function mapShadowfaxStatus(statusId: string): string | null {
  const key = (statusId || "").trim().toLowerCase();
  if (!key) return null;
  return STATUS_MAP[key] ?? null;
}

// Delhivery shipment tracking client (Pull API).
//
// Production tracking endpoint and auth format confirmed against
// Delhivery's own API docs:
//   https://track.delhivery.com/api/v1/packages/json/?waybill=<AWB1>,<AWB2>
//   Header: Authorization: Token <API_TOKEN>
// Rate limit: 750 requests / 5 min / IP — batch multiple waybills into one
// call (comma-separated) rather than one request per order.
//
// Delhivery also offers a PUSH webhook, but it isn't self-serve: you have
// to email their integration team your endpoint URL + 1-2 live waybills
// for testing, and they quote 5-6 working days to build/test/deploy it on
// their side. This client is the pull-based fallback that works right now
// with just an API token — see /orders/[id] for the manual "Sync Now"
// button built on top of it.

const BASE_URL = process.env.DELHIVERY_BASE_URL || "https://track.delhivery.com";

export type DelhiveryShipmentStatus = {
  Status: string;
  StatusDateTime: string;
  StatusType: string;
  StatusLocation: string;
  Instructions: string;
};

export type DelhiveryShipment = {
  AWB: string;
  ReferenceNo?: string;
  PickUpDate?: string;
  Status: DelhiveryShipmentStatus;
  Scans?: Array<{
    ScanDetail?: {
      Scan?: string;
      Instructions?: string;
      ScanDateTime?: string;
      ScannedLocation?: string;
      StatusCode?: string;
    };
  }>;
};

// Shared low-level call — the packages/json endpoint accepts EITHER a
// waybill list OR a reference-number list (never both), per Delhivery's
// docs: "waybill: List of waybill numbers... Not required if ref_nos is
// given (mandatory)". https://delhivery-express-api-doc.readme.io/reference/testtrack-order
async function trackPackages(paramName: "waybill" | "ref_nos", values: string[]): Promise<any[]> {
  const token = process.env.DELHIVERY_API_TOKEN;

  if (!token) {
    throw new Error("Missing DELHIVERY_API_TOKEN env var");
  }

  const clean = values.map((v) => v.trim()).filter(Boolean);
  if (clean.length === 0) return [];

  const url = `${BASE_URL}/api/v1/packages/json/?${paramName}=${clean.map(encodeURIComponent).join(",")}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
    },
  });

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Delhivery returned non-JSON response (status ${res.status}): ${text.slice(0, 300)}`);
  }

  if (!res.ok) {
    throw new Error(typeof json === "string" ? json : JSON.stringify(json));
  }

  // Response shape is { ShipmentData: [ { Shipment: {...} }, ... ] } per
  // Delhivery's docs.
  return json?.ShipmentData || [];
}

// Tracks one or more waybills in a single request. Returns a map of
// waybill -> shipment data (missing/unrecognized waybills just won't be in
// the map, not an error).
export async function trackWaybills(
  waybills: string[]
): Promise<Record<string, DelhiveryShipment>> {
  const list = await trackPackages("waybill", waybills);
  const byWaybill: Record<string, DelhiveryShipment> = {};

  for (const entry of list) {
    const shipment = entry?.Shipment;
    if (shipment?.AWB) {
      byWaybill[shipment.AWB] = shipment;
    }
  }

  return byWaybill;
}

// Raw version — returns every shipment Delhivery matched for this batch of
// reference numbers, unfiltered. Useful for diagnostics: if a lookup isn't
// matching as expected, comparing the ReferenceNo values actually stored on
// Delhivery's side against what we sent usually reveals why (different
// formatting, case, whitespace, or the shipment simply wasn't created with
// that reference at all).
export async function trackByReferenceNumbersRaw(refNos: string[]): Promise<DelhiveryShipment[]> {
  const list = await trackPackages("ref_nos", refNos);
  return list.map((entry: any) => entry?.Shipment).filter(Boolean);
}

// Tracks one or more shipments by the reference number given at shipment
// creation time in Delhivery One — useful when the AWB was never manually
// pasted back into this app, but the order number was used as the
// reference/"Order ID" field on Delhivery's side. Returns a map of
// referenceNumber -> shipment data (unmatched reference numbers just won't
// be in the map, not an error — Delhivery has no shipment for them, either
// because it wasn't created there or a different reference was used).
export async function trackByReferenceNumbers(
  refNos: string[]
): Promise<Record<string, DelhiveryShipment>> {
  const shipments = await trackByReferenceNumbersRaw(refNos);
  const byRefNo: Record<string, DelhiveryShipment> = {};

  for (const shipment of shipments) {
    if (shipment?.ReferenceNo) {
      byRefNo[shipment.ReferenceNo] = shipment;
    }
  }

  return byRefNo;
}

// Best-effort mapping from Delhivery's raw scan status text to this app's
// shipping_status values. Delhivery's exact status vocabulary isn't fully
// published — this covers the dashboard state names documented at
// help.delhivery.com/docs/track-orders (Pending, Ready to Ship, Ready for
// Pickup, In Transit, Out for Delivery, Delivered, Cancelled/RTO, Lost)
// plus common raw scan wording. Returns null for anything unrecognized so
// callers can leave shipping_status untouched rather than guess wrong —
// the raw text is always stored separately in delhivery_last_status_raw so
// you can see exactly what came back and refine this mapping if needed.
export function mapDelhiveryStatus(rawStatus: string): string | null {
  const s = (rawStatus || "").toLowerCase();
  if (!s) return null;

  if (s.includes("out for delivery")) return "out_for_delivery";
  // Delhivery can report "RTO Delivered", meaning returned to seller—not
  // delivered to the customer. "Undelivered" is also not completion.
  if (s.includes("rto") || s.includes("return")) return "returned";
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("lost")) return "cancelled";
  if (s.includes("undeliver") || s.includes("not delivered") || s.includes("delivery attempted")) return null;
  if (/\bdelivered\b/.test(s)) return "delivered";
  if (s.includes("transit") || s.includes("dispatch") || s.includes("pickedup") || s.includes("picked up")) {
    return "shipped";
  }
  if (s.includes("ready for pickup") || s.includes("pickup scheduled")) return "packed";
  if (s.includes("manifest") || s.includes("ready to ship")) return "confirmed";
  if (s.includes("pending")) return "pending";

  return null;
}

// Delhivery's top-level Status can be a generic "Pending" even after the
// parcel has been picked up and moved between facilities. In that case the
// Scans array is the reliable lifecycle evidence. Choose the furthest real
// stage seen across both sources, while preserving terminal return/cancel
// signals. This prevents a later facility-level "Pending" scan from hiding
// an earlier, genuine "In Transit" scan.
export function deriveDelhiveryShipmentStatus(shipment: DelhiveryShipment): {
  rawStatus: string;
  mappedStatus: string | null;
  location: string;
} {
  const candidates: Array<{ label: string; mapped: string | null; location: string; time: string }> = [];
  const headline = shipment.Status;
  if (headline) {
    const label = headline.Status || headline.Instructions || "";
    candidates.push({
      label,
      mapped: mapDelhiveryStatus(`${headline.Status || ""} ${headline.Instructions || ""}`),
      location: headline.StatusLocation || "",
      time: headline.StatusDateTime || "",
    });
  }

  for (const wrapper of shipment.Scans || []) {
    const scan = wrapper.ScanDetail;
    if (!scan) continue;
    candidates.push({
      label: scan.Scan || scan.Instructions || "",
      mapped: mapDelhiveryStatus(`${scan.Scan || ""} ${scan.Instructions || ""}`),
      location: scan.ScannedLocation || "",
      time: scan.ScanDateTime || "",
    });
  }

  const terminal = candidates
    .filter((c) => c.mapped === "returned" || c.mapped === "cancelled")
    .sort((a, b) => b.time.localeCompare(a.time))[0];
  if (terminal) return { rawStatus: terminal.label, mappedStatus: terminal.mapped, location: terminal.location };

  const rank: Record<string, number> = {
    pending: 0, confirmed: 1, packed: 2, shipped: 3, out_for_delivery: 4, delivered: 5,
  };
  const best = candidates
    .filter((c) => c.mapped && rank[c.mapped] !== undefined)
    .sort((a, b) => (rank[b.mapped!] - rank[a.mapped!]) || b.time.localeCompare(a.time))[0];

  if (best) return { rawStatus: best.label, mappedStatus: best.mapped, location: best.location };
  return {
    rawStatus: headline?.Status || headline?.Instructions || "",
    mappedStatus: null,
    location: headline?.StatusLocation || "",
  };
}

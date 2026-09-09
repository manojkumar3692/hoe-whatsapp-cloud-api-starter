import { NextRequest, NextResponse } from "next/server";
import { bulkSyncOrdersByOrderNumber } from "../../../../lib/delhiverySync";
import { bulkSyncShadowfaxStatuses } from "../../../../lib/shadowfaxSync";

// Matches every order missing a waybill against Delhivery by ORDER NUMBER
// (the "Order ID" / reference field used when creating the shipment in
// Delhivery One) instead of requiring the AWB to be pasted in one order at
// a time. On a match it backfills delhivery_waybill with the real AWB and
// updates Delivery Status / Order Status exactly like a normal sync.
export async function POST(req: NextRequest) {
  const form = await req.formData();

  const [result, shadowfax] = await Promise.all([
    bulkSyncOrdersByOrderNumber(),
    bulkSyncShadowfaxStatuses(),
  ]);

  const returnTo = String(form.get("return_to") || "/orders");
  const url = new URL(returnTo, req.url);
  url.searchParams.set("bulk_sync", "1");
  url.searchParams.set("checked", String(result.checked));
  url.searchParams.set("matched", String(result.matched));
  url.searchParams.set("updated", String(result.updated));
  url.searchParams.set("unmatched", String(result.unmatchedOrderNumbers.length));
  url.searchParams.set("shipments_returned", String(result.totalShipmentsReturned));
  url.searchParams.set("shadowfax_checked", String(shadowfax.checked));
  url.searchParams.set("shadowfax_matched", String(shadowfax.matched));
  url.searchParams.set("shadowfax_updated", String(shadowfax.updated));
  if (result.sampleReturnedReferenceNumbers.length > 0) {
    url.searchParams.set("sample_refs", result.sampleReturnedReferenceNumbers.join(","));
  }
  if (result.unmatchedOrderNumbers.length > 0) {
    url.searchParams.set("sample_unmatched", result.unmatchedOrderNumbers.slice(0, 10).join(","));
  }
  const errors = [result.error, shadowfax.error].filter(Boolean);
  if (errors.length) url.searchParams.set("bulk_sync_error", errors.join("; "));

  return NextResponse.redirect(url, 303);
}

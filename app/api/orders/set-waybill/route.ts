import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

// Saves the Delhivery AWB/waybill number against an order — entered
// manually after creating the shipment in Delhivery One. Once set, the
// order page can pull live status against it via /sync-delhivery.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const id = String(form.get("id") || "");
    const waybill = String(form.get("delhivery_waybill") || "").trim();

    if (!id) {
      return NextResponse.json({ error: "Order ID required" }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    const { data: existing } = await supabase
      .from("orders")
      .select("delhivery_waybill")
      .eq("id", id)
      .maybeSingle();

    const waybillChanged = (existing?.delhivery_waybill || "") !== waybill;

    const updatePayload: any = {
      delhivery_waybill: waybill || null,
      updated_at: new Date().toISOString(),
    };

    // Clearing or correcting the waybill also clears any status pulled in
    // from the OLD (possibly wrong) AWB — otherwise a stale/wrong status
    // would keep showing until the next sync overwrites it. This does NOT
    // undo any Order Status change a bad sync may have already caused —
    // that still needs a manual fix via the Update Order form below.
    if (waybillChanged) {
      updatePayload.delhivery_last_status_raw = null;
      updatePayload.delhivery_last_synced_at = null;
    }

    const { error } = await supabase.from("orders").update(updatePayload).eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (waybillChanged) {
      await supabase.from("order_status_history").insert({
        order_id: id,
        status: "waybill_updated",
        note: waybill
          ? `Delhivery waybill set to ${waybill}${existing?.delhivery_waybill ? ` (was ${existing.delhivery_waybill})` : ""}`
          : `Delhivery waybill cleared (was ${existing?.delhivery_waybill})`,
      });
    }

    return NextResponse.redirect(new URL(`/orders/${id}`, req.url), 303);
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Failed to save waybill" },
      { status: 500 }
    );
  }
}

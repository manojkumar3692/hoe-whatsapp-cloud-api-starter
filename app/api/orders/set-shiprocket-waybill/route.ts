import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { isShiprocketEnabled } from "../../../../lib/shiprocket";

export async function POST(req: NextRequest) {
  if (!isShiprocketEnabled()) {
    return NextResponse.json({ error: "Shiprocket integration is currently on hold" }, { status: 404 });
  }
  try {
    const form = await req.formData();
    const id = String(form.get("id") || "");
    const waybill = String(form.get("shiprocket_waybill") || "").trim();
    if (!id) return NextResponse.json({ error: "Order ID required" }, { status: 400 });

    const supabase = supabaseAdmin();
    const { data: existing } = await supabase
      .from("orders")
      .select("shiprocket_waybill")
      .eq("id", id)
      .maybeSingle();
    const changed = (existing?.shiprocket_waybill || "") !== waybill;
    const updatePayload: any = {
      shiprocket_waybill: waybill || null,
      updated_at: new Date().toISOString(),
    };
    if (changed) {
      updatePayload.shiprocket_last_status_raw = null;
      updatePayload.shiprocket_last_synced_at = null;
      updatePayload.shiprocket_courier_name = null;
      updatePayload.shiprocket_tracking_url = null;
    }

    const { error } = await supabase.from("orders").update(updatePayload).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (changed) {
      await supabase.from("order_status_history").insert({
        order_id: id,
        status: "waybill_updated",
        note: waybill
          ? `Shiprocket AWB set to ${waybill}${existing?.shiprocket_waybill ? ` (was ${existing.shiprocket_waybill})` : ""}`
          : `Shiprocket AWB cleared (was ${existing?.shiprocket_waybill})`,
      });
    }
    return NextResponse.redirect(new URL(`/orders/${id}`, req.url), 303);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to save Shiprocket AWB" }, { status: 500 });
  }
}

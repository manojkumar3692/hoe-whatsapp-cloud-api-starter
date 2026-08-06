import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

// Saves the Delhivery AWB/waybill number against an order — entered
// manually after creating the shipment in Delhivery One. Once set, the
// order page can pull live status against it via /sync-delhivery.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    if (form.get("admin_password") !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = String(form.get("id") || "");
    const waybill = String(form.get("delhivery_waybill") || "").trim();

    if (!id) {
      return NextResponse.json({ error: "Order ID required" }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    const { error } = await supabase
      .from("orders")
      .update({
        delhivery_waybill: waybill || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.redirect(new URL(`/orders/${id}`, req.url), 303);
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Failed to save waybill" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const id = String(form.get("id") || "");
    const paymentStatus = String(form.get("payment_status") || "");
    const shippingStatus = String(form.get("shipping_status") || "");
    const trackingUrl = String(form.get("tracking_url") || "").trim();
    const notes = String(form.get("notes") || "").trim();

    if (!id) {
      return NextResponse.json({ error: "Order ID required" }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    const { error } = await supabase
      .from("orders")
      .update({
        payment_status: paymentStatus,
        shipping_status: shippingStatus,
        tracking_url: trackingUrl || null,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.redirect(new URL(`/orders/${id}`, req.url), 303);
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Order update failed" },
      { status: 500 }
    );
  }
}
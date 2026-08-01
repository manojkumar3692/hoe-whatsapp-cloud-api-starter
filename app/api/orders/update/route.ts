import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    if (form.get("admin_password") !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = String(form.get("id") || "");
    const paymentStatus = String(form.get("payment_status") || "");
    const shippingStatus = String(form.get("shipping_status") || "");
    const trackingUrl = String(form.get("tracking_url") || "").trim();
    const notes = String(form.get("notes") || "").trim();
    const statusNote = String(form.get("status_note") || "").trim();
    const codBalanceStatusRaw = form.get("cod_balance_status");

    if (!id) {
      return NextResponse.json({ error: "Order ID required" }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // Fetch the current status first so we know whether this update actually
    // moves the order forward in its lifecycle (for the history log below).
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("shipping_status")
      .eq("id", id)
      .maybeSingle();

    const updatePayload: any = {
      payment_status: paymentStatus,
      shipping_status: shippingStatus,
      tracking_url: trackingUrl || null,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    };

    // Only present on the form for partial_cod orders — don't touch the
    // column otherwise.
    if (codBalanceStatusRaw !== null) {
      updatePayload.cod_balance_status = String(codBalanceStatusRaw);
    }

    const { error } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log to the order timeline whenever the status actually changed, or the
    // admin left a note on this update (even without changing the status).
    const statusChanged = existingOrder && existingOrder.shipping_status !== shippingStatus;
    if (statusChanged || statusNote) {
      await supabase.from("order_status_history").insert({
        order_id: id,
        status: shippingStatus,
        note: statusNote || null,
      });
    }

    // Defaults to the order detail page (full edit form there), but the
    // orders list's inline quick-edit passes return_to=/orders (plus
    // whatever filters were active) so a quick status change doesn't yank
    // the admin out of the filtered list they were looking at.
    const returnToRaw = String(form.get("return_to") || "");
    // Only allow same-site relative paths — never redirect to an
    // arbitrary/external URL supplied in the form.
    const returnTo = returnToRaw.startsWith("/") ? returnToRaw : `/orders/${id}`;

    return NextResponse.redirect(new URL(returnTo, req.url), 303);
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Order update failed" },
      { status: 500 }
    );
  }
}
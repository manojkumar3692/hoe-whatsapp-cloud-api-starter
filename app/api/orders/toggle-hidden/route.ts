import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

// Marks/unmarks an order as hidden (test, spam, internal — whatever isn't a
// real customer order). Hidden orders are excluded from the default
// /orders view but never deleted; a "Show hidden" toggle on the list
// brings them back into view.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    if (form.get("admin_password") !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = String(form.get("id") || "");
    const hidden = String(form.get("hidden") || "") === "true";
    const reason = String(form.get("hidden_reason") || "").trim();

    if (!id) {
      return NextResponse.json({ error: "Order ID required" }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    const { error } = await supabase
      .from("orders")
      .update({
        is_hidden: hidden,
        hidden_reason: hidden ? reason || "Marked as test/spam" : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const returnToRaw = String(form.get("return_to") || "");
    const returnTo = returnToRaw.startsWith("/") ? returnToRaw : "/orders";

    return NextResponse.redirect(new URL(returnTo, req.url), 303);
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Failed to update order" },
      { status: 500 }
    );
  }
}

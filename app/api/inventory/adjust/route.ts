import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    if (form.get("admin_password") !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const skuId = String(form.get("sku_id") || "");
    const mode = String(form.get("mode") || "");
    const rawQuantity = String(form.get("quantity") || "").trim();
    const reason = String(form.get("reason") || "").trim();
    const quantity = Number(rawQuantity);

    if (!skuId || !["adjust", "set"].includes(mode)) {
      return NextResponse.json({ error: "Invalid inventory request" }, { status: 400 });
    }
    if (!/^-?\d+$/.test(rawQuantity) || !Number.isSafeInteger(quantity)) {
      return NextResponse.json({ error: "Quantity must be a whole number" }, { status: 400 });
    }
    if (mode === "set" && quantity < 0) {
      return NextResponse.json({ error: "Stock count cannot be negative" }, { status: 400 });
    }
    if (reason.length < 3) {
      return NextResponse.json({ error: "Please enter a reason" }, { status: 400 });
    }

    const supabase = supabaseAdmin();
    const { error } = await supabase.rpc("adjust_inventory", {
      p_sku_id: skuId,
      p_mode: mode,
      p_quantity: quantity,
      p_reason: reason,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.redirect(new URL("/inventory?updated=1", req.url), 303);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Inventory update failed" }, { status: 500 });
  }
}


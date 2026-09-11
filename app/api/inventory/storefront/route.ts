import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    if (form.get("admin_password") !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const skuId = String(form.get("sku_id") || "");
    const enabled = String(form.get("enabled") || "") === "true";
    const reason = String(form.get("reason") || "").trim();

    if (!skuId || reason.length < 3) {
      return NextResponse.json(
        { error: "SKU and a reason of at least 3 characters are required" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin().rpc(
      "set_inventory_storefront_enabled",
      { p_sku_id: skuId, p_enabled: enabled, p_reason: reason }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.redirect(
      new URL(`/inventory?availability_updated=1`, req.url),
      303
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Storefront availability update failed" },
      { status: 500 }
    );
  }
}

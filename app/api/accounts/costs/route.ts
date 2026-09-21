import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { parseItems, textField, validDate, itemTotal } from "../../../../lib/finance";
import { financeAccess, financeError, validId } from "../../../../lib/financeRequest";
export async function POST(req: NextRequest) {
  const denied = await financeAccess(req, true); if (denied) return denied;
  let args;
  try {
    const raw = await req.json();
    if (!validId(raw.id) || !validId(raw.sku_id) || !validDate(raw.effective_from)) throw new Error("Select a product and valid effective date.");
    const components = parseItems(raw.components);
    if (itemTotal(components) <= 0) throw new Error("Unit cost must be greater than zero.");
    args = { p_id: raw.id, p_sku_id: raw.sku_id, p_effective_from: raw.effective_from, p_components: components, p_notes: textField(raw.notes, "Cost basis note", 2000) };
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid cost." }, { status: 400 }); }
  const { error } = await supabaseAdmin().rpc("finance_add_cost", args);
  return error ? financeError(error) : NextResponse.json({ saved: true });
}

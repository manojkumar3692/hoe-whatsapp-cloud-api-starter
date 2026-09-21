import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { decimalUnits, textField, validDate } from "../../../../lib/finance";
import { dateKey } from "../../../../lib/accounting";
import { financeAccess, financeError, validId } from "../../../../lib/financeRequest";
export async function POST(req: NextRequest) {
  const denied = await financeAccess(req, true); if (denied) return denied;
  let args;
  try {
    const raw = await req.json();
    if (!validId(raw.id) || !validId(raw.bill_id) || !validDate(raw.paid_on) || raw.paid_on > dateKey(new Date())) throw new Error("Choose a valid bill and payment date, no later than today.");
    const amount = decimalUnits(raw.amount, 2, "Payment");
    if (!amount) throw new Error("Payment must be greater than zero.");
    args = { p_id: raw.id, p_bill_id: raw.bill_id, p_paid_on: raw.paid_on, p_amount_paise: amount, p_reference: textField(raw.reference, "Payment reference") };
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid payment." }, { status: 400 }); }
  const { error } = await supabaseAdmin().rpc("finance_record_payment", args);
  return error ? financeError(error) : NextResponse.json({ saved: true });
}

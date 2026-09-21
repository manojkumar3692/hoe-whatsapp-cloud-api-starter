import { supabaseAdmin } from "./supabaseAdmin";
import { AccountOrder } from "./accounting";

// Paginate beyond Supabase's row limit; never reuse the operational dashboard's
// inferred-payment filter or its 300-row display cap for accounts.
export async function loadAccountOrders(from: string, to: string, invoiceDetails = false): Promise<AccountOrder[]> {
  const rows: AccountOrder[] = [];
  const db = supabaseAdmin();
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("orders")
      .select(invoiceDetails ? "*" : "id,order_number,created_at,customer_name,customer_state,amount_in_paise,payment_status,payment_type,token_amount_in_paise,balance_due_in_paise,cod_balance_status,shipping_status,is_hidden,items")
      .eq("payment_status", "paid").eq("is_hidden", false).in("payment_type", ["full", "partial_cod"])
      .gte("created_at", from).lt("created_at", to)
      .order("created_at", { ascending: true }).order("id", { ascending: true })
      .range(offset, offset + 499);
    if (error) throw new Error("Accounts data could not be loaded. Please try again.");
    rows.push(...(data || []) as unknown as AccountOrder[]);
    if (!data || data.length < 500) break;
  }
  return rows;
}

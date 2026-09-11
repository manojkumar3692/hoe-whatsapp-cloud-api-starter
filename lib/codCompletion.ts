import { supabaseAdmin } from "./supabaseAdmin";

// Reconciles COD orders that reached delivered before the automatic
// delivery=>completion rule existed. This is safe to call repeatedly: only
// rows whose balance is still pending are selected, so each order is closed
// and logged once.
export async function completeDeliveredCodOrders(): Promise<{ completed: number; error?: string }> {
  const supabase = supabaseAdmin();
  const { data: orders, error: fetchError } = await supabase
    .from("orders")
    .select("id")
    .eq("is_hidden", false)
    .eq("payment_status", "paid")
    .eq("payment_type", "partial_cod")
    .eq("cod_balance_status", "pending")
    .eq("shipping_status", "delivered");

  if (fetchError) return { completed: 0, error: fetchError.message };

  let completed = 0;
  await Promise.all((orders || []).map(async (order) => {
    const { data: updated, error } = await supabase
      .from("orders")
      .update({ shipping_status: "completed", cod_balance_status: "collected" })
      .eq("id", order.id)
      .eq("shipping_status", "delivered")
      .eq("cod_balance_status", "pending")
      .select("id")
      .maybeSingle();

    if (error || !updated) return;
    completed++;
    await supabase.from("order_status_history").insert({
      order_id: order.id,
      status: "completed",
      note: "Courier delivery confirmed — COD balance assumed collected per business rule",
    });
  }));

  return { completed };
}


import { supabaseAdmin } from "./supabaseAdmin";
import { buildGenie, GenieOrder, GenieSku } from "./genie";

export async function genieRows<T>(build: () => any): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await build().range(start, start + 499);
    if (error || !data) throw new Error("Business data could not be loaded. Please retry.");
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
export async function loadGenie() {
  const db = supabaseAdmin(), now = new Date();
  const [orders, skus] = await Promise.all([
    genieRows<GenieOrder>(() => db.from("orders").select("id,created_at,payment_status,shipping_status,is_hidden,amount_in_paise,items").eq("is_hidden", false).lt("created_at", now.toISOString()).order("created_at").order("id")),
    genieRows<GenieSku>(() => db.from("inventory_skus").select("id,sku,product_key,product_name,size,current_stock,low_stock_threshold,active").order("id")),
  ]);
  return buildGenie(orders, skus, now);
}

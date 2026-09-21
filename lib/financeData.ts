import { supabaseAdmin } from "./supabaseAdmin";
import { dateKey, shiftMonth, weekStart } from "./accounting";
import { Bill, BillPayment, ProductCost, Sku, MetaDaily, MetaCampaign, MetaSync } from "./finance";

async function allRows<T>(build: () => any): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await build().range(start, start + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
export async function loadFinance(month: string) {
  const db = supabaseAdmin();
  const accountId = (process.env.META_AD_ACCOUNT_ID || "").replace(/^act_/, "");
  const today = dateKey(new Date()), recentFrom = [weekStart(new Date()), `${today.slice(0, 7)}-01`].sort()[0];
  try {
    const [bills, payments, costs, skus, daily, campaigns, syncs, currentDaily] = await Promise.all([
      allRows<Bill>(() => db.from("finance_bills").select("*").order("id")),
      allRows<BillPayment>(() => db.from("finance_bill_payments").select("*").order("id")),
      allRows<ProductCost>(() => db.from("finance_product_costs").select("*").order("id")),
      allRows<Sku>(() => db.from("inventory_skus").select("id,sku,product_key,product_name,size").order("id")),
      accountId ? allRows<MetaDaily>(() => db.from("finance_meta_daily").select("*").eq("account_id", accountId).gte("day", `${month}-01`).lt("day", `${shiftMonth(month, 1)}-01`).order("day").order("campaign_id")) : [],
      accountId ? allRows<MetaCampaign>(() => db.from("finance_meta_campaigns").select("*").eq("account_id", accountId).order("campaign_id")) : [],
      accountId ? allRows<MetaSync>(() => db.from("finance_meta_syncs").select("*").eq("account_id", accountId).order("month")) : [],
      accountId ? allRows<MetaDaily>(() => db.from("finance_meta_daily").select("*").eq("account_id", accountId).gte("day", recentFrom).lte("day", today).order("day").order("campaign_id")) : [],
    ]);
    return { ready: true as const, bills, payments, costs, skus, daily, campaigns, syncs, currentDaily, accountId, metaConfigured: !!accountId && !!process.env.META_ADS_ACCESS_TOKEN };
  } catch (error: any) {
    return { ready: false as const, setupRequired: ["42P01", "PGRST205"].includes(error?.code), message: ["42P01", "PGRST205"].includes(error?.code) ? "The purchases, advertising and costing database needs its one-time setup." : "Finance data could not be loaded. Totals are unavailable; please retry." };
  }
}

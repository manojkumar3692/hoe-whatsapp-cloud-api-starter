import { dateKey, shiftMonth, validMonth } from "./accounting";
import { decimalUnits, MetaCampaign, MetaDaily, validDate } from "./finance";
import { supabaseAdmin } from "./supabaseAdmin";

type GraphRow = Record<string, any>;
function integer(value: unknown, field: string): number {
  const n = Number(value ?? 0);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`Meta returned an invalid ${field}. No report was saved.`);
  return n;
}
// Purchase actions can contain aggregate AND pixel-specific versions. Select
// one definition, never add all purchase aliases together.
export function purchaseAction(actions: any): number {
  if (!Array.isArray(actions)) return 0;
  for (const key of ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]) {
    const value = actions.find(a => a.action_type === key)?.value;
    if (value !== undefined) {
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0 || number > 1_000_000_000) throw new Error("Invalid Meta purchase metric.");
      return number;
    }
  }
  return 0;
}
export function metaPeriod(month: string, now = new Date()) {
  if (!validMonth(month)) throw new Error("Choose a valid month.");
  const today = dateKey(now);
  if (month > today.slice(0, 7)) throw new Error("Future months cannot be synced.");
  const end = new Date(`${shiftMonth(month, 1)}-01T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  return { since: `${month}-01`, until: month === today.slice(0, 7) ? today : end.toISOString().slice(0, 10) };
}

export async function graphPages(path: string, params: Record<string, string>, token: string, version: string, fetcher: typeof fetch = fetch): Promise<GraphRow[]> {
  const rows: GraphRow[] = [];
  let after = "";
  const cursors = new Set<string>();
  for (let page = 0; page < 200; page++) {
    const url = new URL(`https://graph.facebook.com/${version}/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    if (after) url.searchParams.set("after", after);
    const response = await fetcher(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
    const body = await response.json();
    if (!response.ok || body.error) {
      const code = body.error?.code;
      throw new Error(code === 190 ? "Meta access expired. Update the server-side ad token and retry." : code === 10 || code === 200 ? "Meta access is missing. Grant ads_read and access to this ad account." : "Meta could not complete the report. Retry later; the last successful report is unchanged.");
    }
    if (!Array.isArray(body.data)) return [body]; // Account metadata endpoint.
    rows.push(...body.data);
    if (!body.paging?.next) return rows;
    // Never follow returned URLs with credentials. Read only the cursor and
    // reconstruct the same trusted Graph endpoint on every page.
    after = body.paging.cursors?.after || "";
    if (!after || cursors.has(after)) throw new Error("Meta pagination did not complete. No report was saved.");
    cursors.add(after);
  }
  throw new Error("Meta report is too large for a single sync. No partial report was saved.");
}

export async function syncMetaMonth(month: string) {
  const token = process.env.META_ADS_ACCESS_TOKEN, account = (process.env.META_AD_ACCOUNT_ID || "").replace(/^act_/, "");
  const version = process.env.META_ADS_API_VERSION || process.env.META_API_VERSION || "v23.0";
  if (!token || !/^\d+$/.test(account)) throw new Error("Connect Meta by configuring META_AD_ACCOUNT_ID and META_ADS_ACCESS_TOKEN on the server.");
  if (!/^v\d+\.0$/.test(version)) throw new Error("Invalid Meta API version configuration.");
  const period = metaPeriod(month), started = new Date().toISOString();
  const [info] = await graphPages(`act_${account}`, { fields: "id,name,currency,timezone_name" }, token, version);
  if (info.id !== `act_${account}` || info.currency !== "INR" || !["Asia/Kolkata", "Asia/Calcutta"].includes(info.timezone_name)) throw new Error("This accounts workspace requires a Meta ad account in INR and India time. Currency/time-zone conversion is not configured.");
  const [campaignRows, insightRows] = await Promise.all([
    graphPages(`act_${account}/campaigns`, { fields: "id,name,effective_status,daily_budget,lifetime_budget,objective", limit: "200" }, token, version),
    graphPages(`act_${account}/insights`, { fields: "account_id,account_currency,campaign_id,campaign_name,date_start,date_stop,spend,impressions,clicks,actions,action_values", level: "campaign", time_increment: "1", time_range: JSON.stringify(period), limit: "500", use_account_attribution_setting: "true" }, token, version),
  ]);
  const campaigns: MetaCampaign[] = campaignRows.map(c => {
    if (!/^\d+$/.test(c.id) || typeof c.name !== "string" || typeof c.effective_status !== "string") throw new Error("Meta returned incomplete campaign data.");
    return { account_id: account, campaign_id: c.id, name: c.name, effective_status: c.effective_status, daily_budget_paise: c.daily_budget == null ? null : integer(c.daily_budget, "budget"), lifetime_budget_paise: c.lifetime_budget == null ? null : integer(c.lifetime_budget, "budget"), objective: c.objective || "" };
  });
  const seen = new Set<string>();
  const daily: MetaDaily[] = insightRows.map(row => {
    if (row.account_id !== account || row.account_currency !== "INR" || !validDate(row.date_start) || row.date_start !== row.date_stop || row.date_start < period.since || row.date_start > period.until || !/^\d+$/.test(row.campaign_id)) throw new Error("Meta returned inconsistent report data. No report was saved.");
    const key = `${row.campaign_id}:${row.date_start}`;
    if (seen.has(key)) throw new Error("Meta returned duplicate daily rows. No report was saved.");
    seen.add(key);
    return { account_id: account, campaign_id: row.campaign_id, campaign_name: String(row.campaign_name || row.campaign_id), day: row.date_start, spend_paise: decimalUnits(row.spend ?? "0", 2, "Meta spend"), impressions: integer(row.impressions, "impressions"), clicks: integer(row.clicks, "clicks"), purchases: purchaseAction(row.actions), purchase_value_paise: Math.round(purchaseAction(row.action_values) * 100) };
  });
  const { error } = await supabaseAdmin().rpc("finance_commit_meta", { p_account: account, p_month: month, p_through: period.until, p_started: started, p_name: info.name, p_currency: info.currency, p_timezone: info.timezone_name, p_daily: daily, p_campaigns: campaigns });
  if (error) throw new Error(["PGRST202", "42P01"].includes(error.code) ? "Finance database setup is required before syncing." : "Could not save the complete Meta report. Please retry; the previous report is unchanged.");
  return { campaigns: campaigns.length, dailyRows: daily.length, through: period.until };
}

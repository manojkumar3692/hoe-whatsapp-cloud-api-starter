import { graphPages, metaPeriod } from "./metaAds";

// Activity payloads are not a documented payment ledger. Keep diagnostics out
// of financial totals until amounts, units and references are reconciled.
export async function checkMetaBilling(month: string, fetcher: typeof fetch = fetch) {
  const period = metaPeriod(month);
  const account = (process.env.META_AD_ACCOUNT_ID || "").replace(/^act_/, "");
  const token = process.env.META_ADS_ACCESS_TOKEN;
  const version = process.env.META_ADS_API_VERSION || process.env.META_API_VERSION || "v23.0";
  if (!token || !/^\d+$/.test(account)) throw new Error("Set META_ADS_ACCESS_TOKEN and META_AD_ACCOUNT_ID in the server environment, then restart the app.");
  if (!/^v\d+\.0$/.test(version)) throw new Error("Invalid Meta API version configuration.");
  const [info] = await graphPages(`act_${account}`, { fields: "id,name,currency,timezone_name,is_prepay_account" }, token, version, fetcher);
  if (info.id !== `act_${account}` || info.currency !== "INR" || !["Asia/Kolkata", "Asia/Calcutta"].includes(info.timezone_name)) throw new Error("Billing checks require the configured INR account in India time.");
  const since = Date.parse(`${period.since}T00:00:00+05:30`) / 1000;
  const until = Date.parse(`${period.until}T00:00:00+05:30`) / 1000 + 86400;
  const rows = await graphPages(`act_${account}/activities`, {
    fields: "event_time,event_type,extra_data", since: String(since), until: String(until), limit: "100",
  }, token, version, fetcher);
  const events = rows.filter(row => typeof row.event_type === "string" &&
    (row.event_type.startsWith("funding_event_") || row.event_type.startsWith("ad_account_billing_") || row.event_type === "billing_event"))
    .map(row => {
      const timestamp = Date.parse(row.event_time);
      if (!Number.isFinite(timestamp) || timestamp < since * 1000 || timestamp >= until * 1000) throw new Error("Meta returned billing events outside the requested period. Check was not completed.");
      let extra = row.extra_data;
      if (typeof extra === "string") { try { extra = JSON.parse(extra); } catch { extra = null; } }
      // Do not return arbitrary payloads (which can contain payment details).
      // These values are deliberately raw: an undocumented amount may be in
      // rupees or paise, and must never silently become an accounting entry.
      const details: Record<string, string> = {};
      for (const key of ["amount", "currency", "transaction_id", "reference_id", "payment_id"]) {
        const value = extra && typeof extra === "object" ? extra[key] : undefined;
        if (typeof value === "string" || typeof value === "number") details[key] = String(value).slice(0, 200);
      }
      return { time: new Date(timestamp).toISOString(), type: row.event_type as string, details };
    }).sort((a, b) => b.time.localeCompare(a.time));
  return { account, month, checkedAt: new Date().toISOString(), events,
    message: events.length ? "Meta returned billing activity. Amount units and transaction references still need verification against Payment activity. These events are excluded from account totals." : "Meta returned no billing activity for this period. This does not establish that there were no top-ups; the API may not expose your payment history." };
}

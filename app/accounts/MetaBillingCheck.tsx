"use client";
import { useState } from "react";
import type { checkMetaBilling } from "../../lib/metaBilling";
import styles from "./accounts.module.css";

export default function MetaBillingCheck({ month, configured }: { month: string; configured: boolean }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof checkMetaBilling>> | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function check() {
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/accounts/meta/billing-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Billing check failed.");
      setResult(body);
    } catch (e) { setError(e instanceof Error ? e.message : "Billing check failed."); }
    finally { setBusy(false); }
  }
  return <section className={styles.panel}>
    <div className={styles.sectionTitle}><div><p className={styles.eyebrow}>MONEY ADDED TO META</p><h2>Billing API availability</h2></div><button type="button" disabled={!configured || busy} onClick={check}>{busy ? "Checking Meta…" : "Check billing API"}</button></div>
    <p className={styles.footnote}>{configured ? "Check whether Meta exposes funding and billing events for the selected month. This check does not require database setup." : "Waiting for the server-side Meta Ads token. Your administrator must configure META_ADS_ACCESS_TOKEN and the ad account ID, then restart the app."}</p>
    <p className={styles.footnote}>Top-up totals and prepaid balance remain unverified. Activity events are not yet a reconciled payment register.</p>
    {error && <p role="alert">{error}</p>}
    {result && <><p role="status">{result.message}</p><p className={styles.footnote}>Account {result.account} · checked {new Date(result.checkedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>
      {!!result.events.length && <div className={styles.tableWrap}><table><thead><tr><th>Date (IST)</th><th>Event</th><th>API details · units unverified</th></tr></thead><tbody>{result.events.map((event, index) => <tr key={index}><td>{new Date(event.time).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td><td>{event.type.replaceAll("_", " ")}</td><td>{Object.entries(event.details).map(([key, value]) => <div key={key}>{key}: {value}</div>)}{!Object.keys(event.details).length && "No amount or reference exposed"}</td></tr>)}</tbody></table></div>}</>}
  </section>;
}

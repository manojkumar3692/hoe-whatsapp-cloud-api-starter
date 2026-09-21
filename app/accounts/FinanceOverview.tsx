import Link from "next/link";
import { AccountOrder, dateKey, money, shiftMonth } from "../../lib/accounting";
import { loadFinance } from "../../lib/financeData";
import { profitSummary, summarizeBills } from "../../lib/finance";
import styles from "./accounts.module.css";

export default async function FinanceOverview({ month, orders }: { month: string; orders: AccountOrder[] }) {
  const data = await loadFinance(month);
  if (!data.ready) return <section className={styles.panel}><div className={styles.sectionTitle}><div><p className={styles.eyebrow}>PURCHASES · ADVERTISING · COSTS</p><h2>{data.setupRequired ? "Your finance workspace is ready for setup" : "Finance totals are unavailable"}</h2></div></div><p className={styles.footnote}>{data.message} Sales reports above remain available.</p><div className={styles.quickLinks}><Link href={`/accounts/purchases?month=${month}`}>Purchases & expenses →</Link><Link href={`/accounts/advertising?month=${month}`}>Meta advertising →</Link><Link href={`/accounts/costing?month=${month}`}>Product costing →</Link></div></section>;
  const monthEnd = new Date(`${shiftMonth(month, 1)}-01T00:00:00Z`); monthEnd.setUTCDate(monthEnd.getUTCDate() - 1);
  const today = dateKey(new Date()), through = month === today.slice(0, 7) ? today : monthEnd.toISOString().slice(0, 10);
  const summary = profitSummary(orders, data.bills, data.daily, data.syncs.find(s => s.month === month), data.skus, data.costs, month, through);
  const purchases = summarizeBills(data.bills, data.payments, month);
  return <section className={styles.panel}>
    <div className={styles.sectionTitle}><div><p className={styles.eyebrow}>BUSINESS PERFORMANCE / SELECTED MONTH</p><h2>From sales to estimated profit</h2></div><span className={styles.reviewBadge}>{summary.estimate === null ? "Inputs incomplete" : "Standard-cost estimate"}</span></div>
    <div className={styles.profitGrid}>{[["Sales excluding GST", summary.sales], ["Product costs", summary.missing.length ? null : summary.cogs], ["Meta advertising + uncredited tax", summary.advertising], ["Other recorded expenses", summary.expenses], ["Estimated operating profit", summary.estimate]].map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{typeof value === "number" ? money(value) : "Incomplete"}</strong></div>)}</div>
    {summary.missing.length > 0 && <p className={styles.notice}><Link href={`/accounts/costing?month=${month}`}>{summary.missing.length} paid orders need cost or return review.</Link> Known cost for {summary.covered} covered orders: {money(summary.cogs)}. Missing costs are never assumed to be zero.</p>}
    {!summary.metaReady && <p className={styles.notice}><Link href={`/accounts/advertising?month=${month}`}>Sync Meta through {through}</Link> before calculating the estimate. Advertising spend is unknown until a complete report is available.</p>}
    {summary.metaReady && summary.metaSpend !== summary.metaBilled && <p className={styles.notice}>Meta spend and supplier invoice base amounts differ by {money(summary.metaSpend - summary.metaBilled)}. Reconcile billing periods, adjustments and tax invoices; this estimate may be missing invoice tax.</p>}
    <div className={styles.split}><div><span>Supplier bills · invoice month</span><strong>{money(purchases.purchases)}</strong></div><div><span>Unpaid suppliers · all bills</span><strong>{money(purchases.outstanding)}</strong></div><div><span>Input GST verified by accounts</span><strong>{money(purchases.eligibleItc)}</strong></div><div><span>Input GST awaiting review</span><strong>{money(purchases.pendingItc)}</strong></div></div>
    <p className={styles.footnote}>Materials purchases are represented through product costs, not deducted twice. Meta invoice base amounts reconcile synced spend; pending/ineligible GST on those invoices is added as a cost. Estimates use recorded expenses by service month and exclude income tax and unrecorded costs. Input credit totals are not a final GST payable/refund calculation.</p>
    <div className={styles.quickLinks}><Link href={`/accounts/purchases?month=${month}`}>Manage purchases →</Link><Link href={`/accounts/advertising?month=${month}`}>Review Meta spend →</Link><Link href={`/accounts/costing?month=${month}`}>Complete product costs →</Link></div>
  </section>;
}

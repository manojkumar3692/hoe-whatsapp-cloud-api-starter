import Link from "next/link";
import FinanceShell, { selectedMonth, SetupMessage } from "../FinanceShell";
import { CostForm } from "../FinanceForms";
import { loadFinance } from "../../../lib/financeData";
import { costOrders } from "../../../lib/finance";
import { dateKey, money, monthBounds } from "../../../lib/accounting";
import { loadAccountOrders } from "../../../lib/accountsQuery";
import styles from "../accounts.module.css";
export const dynamic = "force-dynamic";
export default async function CostingPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const month = selectedMonth((await searchParams).month), data = await loadFinance(month), today = dateKey(new Date());
  let coverage = null;
  if (data.ready) {
    try { const { from, to } = monthBounds(month); coverage = costOrders(await loadAccountOrders(from, to, true), data.skus, data.costs); } catch { /* Report unavailable rather than zero. */ }
  }
  return <FinanceShell active="costing" month={month} title="Product costing" description="Track what goes into each perfume, then match costs to paid orders.">
    {!data.ready && <SetupMessage message={data.message} />}
    <div className={styles.metrics}><section className={styles.metric}><h2>Costed paid orders</h2><strong>{coverage?.covered ?? "—"}</strong><p>All items have a dated cost</p></section><section className={styles.metric}><h2>Orders needing review</h2><strong>{coverage?.missing.length ?? "—"}</strong><p>Missing costs, mapping or returns</p></section><section className={styles.metric}><h2>Known product costs</h2><strong>{coverage ? money(coverage.cogs) : "—"}</strong><p>Covered orders only · estimated</p></section></div>
    <section className={styles.panel}><details><summary className={styles.formSummary}>+ Add a product cost version</summary><CostForm today={today} skus={data.ready ? data.skus : []} enabled={data.ready} /></details></section>
    <section className={styles.panel}><div className={styles.sectionTitle}><div><p className={styles.eyebrow}>COST HISTORY</p><h2>Cost per finished unit</h2></div><span>Dated versions · INR</span></div><div className={styles.tableWrap}><table><thead><tr><th>Product</th><th>Effective from</th><th>Unit cost</th><th>Components / basis</th></tr></thead><tbody>{data.ready && data.costs.slice().sort((a, b) => b.effective_from.localeCompare(a.effective_from)).map(c => { const sku = data.skus.find(s => s.id === c.sku_id); return <tr key={c.id}><td>{sku?.product_name}<small>{sku?.size} · {sku?.sku}</small></td><td>{c.effective_from}</td><td>{money(c.unit_cost_paise)}</td><td className={styles.wrapCell}>{c.components.map((line, index) => <small key={index}>{line.description} · {line.quantity_milli / 1000} {line.unit} × {money(line.unit_cost_paise)}</small>)}<small>{c.notes}</small></td></tr>; })}{(!data.ready || !data.costs.length) && <tr><td colSpan={4} className={styles.empty}>No product costs recorded. Start with the materials and packaging used for one finished unit.</td></tr>}</tbody></table></div><p className={styles.footnote}>For each order we use the latest cost version effective on its order date. Saved versions are retained; backdated versions can change estimates for past periods. This is standard costing, not a FIFO stock valuation.</p></section>
    {coverage && coverage.missing.length > 0 && <section className={styles.panel}><h2>Complete these costs before using profit</h2><ul className={styles.paymentHistory}>{coverage.missing.map(o => <li key={o.id}><Link href={`/orders/${o.id}`}>{o.number}</Link> · {o.reason}</li>)}</ul></section>}
  </FinanceShell>;
}

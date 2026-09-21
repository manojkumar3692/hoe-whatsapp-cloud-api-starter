import Link from "next/link";
import Header from "../components/Header";
import DownloadButton from "./DownloadButton";
import AccountsNav from "./AccountsNav";
import FinanceOverview from "./FinanceOverview";
import { codNeedsReview, dateKey, monthBounds, monthLabel, money, reviewReasons, shiftMonth, summarize, validMonth, weekStart } from "../../lib/accounting";
import { loadAccountOrders } from "../../lib/accountsQuery";
import styles from "./accounts.module.css";

export const dynamic = "force-dynamic";
export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams, now = new Date(), today = dateKey(now), currentMonth = today.slice(0, 7);
  const month = params.month && validMonth(params.month) ? params.month : currentMonth;
  const months = Array.from({ length: 6 }, (_, index) => shiftMonth(month, -index));
  const week = weekStart(now);
  const from = [monthBounds(months[5]).from, `${week}T00:00:00+05:30`, monthBounds(currentMonth).from].sort()[0];
  const to = monthBounds(month > currentMonth ? month : currentMonth).to;
  let orders;
  try { orders = await loadAccountOrders(from, to); }
  catch { return <main className={styles.page}><Header active="accounts" /><h1>Accounts</h1><section className={styles.panel} role="alert"><h2>Accounts data is unavailable</h2><p>We could not load the orders. No totals or downloads are shown until the data can be verified.</p><Link href={`/accounts?month=${month}`}>Try again</Link></section></main>; }
  const monthly = months.map(key => ({ key, ...summarize(orders.filter(o => dateKey(o.created_at).slice(0, 7) === key)) }));
  const selected = orders.filter(o => dateKey(o.created_at).slice(0, 7) === month), total = monthly[0];
  const thisMonth = summarize(orders.filter(o => dateKey(o.created_at).slice(0, 7) === currentMonth && new Date(o.created_at) <= now));
  const thisWeek = summarize(orders.filter(o => dateKey(o.created_at) >= week && new Date(o.created_at) <= now));
  const reviews = selected.filter(o => reviewReasons(o).length);
  const maxSales = Math.max(1, ...monthly.map(m => m.sales));
  const tab = ["all", "cod", "review"].includes(params.view || "") ? params.view! : "all";
  const filtered = selected.filter(o => tab === "review" ? reviewReasons(o).length : tab === "cod" ? o.payment_type === "partial_cod" && o.cod_balance_status !== "collected" && !codNeedsReview(o) : true).reverse();
  const pages = Math.max(1, Math.ceil(filtered.length / 50));
  const page = Math.min(pages, Math.max(1, Number.parseInt(params.page || "1", 10) || 1));
  const shown = filtered.slice((page - 1) * 50, page * 50);
  return <main className={styles.page}>
    <Header active="accounts" />
    <div className={styles.heading}><div><p className={styles.eyebrow}>HOUSE OF EON / FINANCE</p><h1>Accounts</h1><p>Your sales, collections and monthly GST working papers.</p></div><span className={styles.paidBadge}>● Paid orders only</span></div>
    <AccountsNav active="overview" month={month} />
    <div className={styles.metrics}>
      <Metric title="Sales this week" value={money(thisWeek.sales)} note={`${thisWeek.count} paid orders · Monday to today`} />
      <Metric title="Sales this month" value={money(thisMonth.sales)} note={`${thisMonth.count} paid orders · ${monthLabel(currentMonth)}`} />
      <Metric title="Selected month sales" value={money(total.sales)} note={`${total.count} paid orders · GST inclusive`} />
      <Metric title="COD outstanding" value={money(total.codPending)} note="Balance on selected month's paid COD orders" accent />
    </div>
    <section className={styles.toolbar} aria-label="Accounting period"><form><label htmlFor="month">Accounting month</label><input id="month" name="month" type="month" defaultValue={month} min="2000-01" max="2100-12" required /><button type="submit">View month</button></form><div className={styles.actions}><DownloadButton month={month} format="csv" label="Export register" />{total.count > 0 && <DownloadButton month={month} label="Download invoice ZIP" />}</div></section>
    <p className={styles.basis}>Periods use India time (IST) and order date. Full payments and paid COD tokens qualify. Gross totals include paid returns/cancellations pending review; hidden/test and unpaid orders are excluded.</p>
    <div className={styles.columns}>
      <section className={styles.panel}><div className={styles.sectionTitle}><div><p className={styles.eyebrow}>SALES OVERVIEW</p><h2>Six months at a glance</h2></div><span>Gross · incl. GST</span></div>
        <div className={styles.chart} role="region" aria-label={monthly.slice().reverse().map(m => `${monthLabel(m.key)}: ${money(m.sales)}`).join(". ")}>
          {monthly.slice().reverse().map(m => <Link key={m.key} href={`/accounts?month=${m.key}`} className={styles.barColumn} aria-label={`View ${monthLabel(m.key)}, sales ${money(m.sales)}`}><strong>{money(m.sales)}</strong><div className={styles.barTrack}><div className={m.key === month ? styles.barActive : styles.bar} style={{ height: `${m.sales / maxSales * 100}%`, minHeight: m.sales > 0 ? 4 : 0 }} /></div><span>{new Date(`${m.key}-01T12:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}</span></Link>)}
        </div>
        <div className={styles.split}><div><span>Full-payment sales</span><strong>{money(total.fullSales)}</strong></div><div><span>COD order value</span><strong>{money(total.codSales)}</strong></div></div>
      </section>
      <section className={`${styles.panel} ${styles.collections}`}><p className={styles.eyebrow}>COLLECTIONS / {monthLabel(month).toUpperCase()}</p><h2>Follow the money</h2><div className={styles.moneyLine}><span>Online payments recorded</span><strong>{money(total.online)}</strong></div><div className={styles.moneyLine}><span>COD recorded collected</span><strong>{money(total.codCollected)}</strong></div><div className={`${styles.moneyLine} ${styles.moneyTotal}`}><span>Total recorded collections</span><strong>{money(total.online + total.codCollected)}</strong></div><div className={styles.outstanding}><span>Still to collect · COD</span><strong>{money(total.codPending)}</strong><Link href={`/accounts?month=${month}&view=cod#register`}>Review outstanding orders →</Link></div>{total.codReview > 0 && <p className={styles.notice}>COD balance under review: <strong>{money(total.codReview)}</strong>. Cancelled, returned or disputed orders are excluded from the collection queue.</p>}<p>Collections relate to orders placed in this month, not the date money arrived. COD delivery can automatically mark a balance collected; bank remittance is not tracked.</p></section>
    </div>
    <FinanceOverview month={month} orders={selected} />
    <section className={styles.panel}>
      <div className={styles.sectionTitle}><div><p className={styles.eyebrow}>GST WORKING SUMMARY</p><h2>{monthLabel(month)}</h2></div><span className={styles.reviewBadge}>Provisional · filing not tracked</span></div>
      <div className={styles.taxGrid}><div><span>Taxable sales</span><strong>{money(total.taxable)}</strong></div><div><span>CGST</span><strong>{money(total.cgst)}</strong></div><div><span>SGST</span><strong>{money(total.sgst)}</strong></div><div><span>IGST</span><strong>{money(total.igst)}</strong></div><div className={styles.taxTotal}><span>Output GST</span><strong>{money(total.gst)}</strong></div></div>
      {total.unallocated !== 0 && <p className={styles.notice}>GST split pending: {money(total.unallocated)}. Verify the place of supply for flagged invoices before using the CGST/SGST/IGST totals.</p>}
      <div className={styles.filing}><div><h3>What is left before filing?</h3><p>The existing invoices apply 18% GST inclusive of the order value. Confirm product rates and invoice details, reconcile returns and credit notes, then match eligible purchase credits against GSTR-2B.</p><a href="https://tutorial.gst.gov.in/userguide/returns/FAQ_gstr2b.htm" target="_blank" rel="noreferrer">GST portal: input tax credit guidance ↗</a></div><div><span>Final GST payable / refund</span><strong>Awaiting reconciliation</strong><p>Purchase credit review is tracked in Purchases & expenses. Final liability still requires tax adjustments, credit utilisation and tax payment reconciliation. No final refund is calculated.</p></div></div>
    </section>
    <section className={styles.panel}><div className={styles.sectionTitle}><div><p className={styles.eyebrow}>MONTH-END DOWNLOADS</p><h2>Everything for your accounts team</h2></div><span>PDF invoices + register + review list</span></div><div className={styles.tableWrap}><table><thead><tr><th scope="col">Month</th><th scope="col">Paid invoices</th><th scope="col">Gross sales</th><th scope="col">Output GST</th><th scope="col">Review</th><th scope="col">Invoice pack</th></tr></thead><tbody>{monthly.map(m => <tr key={m.key}><td><Link href={`/accounts?month=${m.key}`}>{monthLabel(m.key)}</Link>{m.key === currentMonth && <small>Month in progress</small>}</td><td>{m.count}</td><td>{money(m.sales)}</td><td>{money(m.gst)}</td><td>{m.review ? <Link href={`/accounts?month=${m.key}&view=review#register`} className={styles.reviewLink}>{m.review} to review</Link> : "—"}</td><td>{m.count ? <DownloadButton month={m.key} label="Download ZIP ↓" /> : <span className={styles.muted}>No paid invoices</span>}</td></tr>)}</tbody></table></div><p className={styles.footnote}>Choose any earlier month above to browse older packs. Downloads contain all matching invoices, not just the rows shown below. PDFs reflect current order data.</p></section>
    <section className={styles.panel} id="register"><div className={styles.sectionTitle}><div><p className={styles.eyebrow}>SALES REGISTER</p><h2>Trace every number to an order</h2></div><DownloadButton month={month} format="csv" label="Download CSV ↓" /></div><nav className={styles.tabs} aria-label="Register views">{[["all", `All paid (${total.count})`], ["cod", "COD outstanding"], ["review", `Needs review (${reviews.length})`]].map(([key, label]) => <Link key={key} href={`/accounts?month=${month}&view=${key}#register`} aria-current={tab === key ? "page" : undefined}>{label}</Link>)}</nav><div className={styles.tableWrap}><table><thead><tr><th scope="col">Invoice / date</th><th scope="col">Customer</th><th scope="col">Payment</th><th scope="col">Gross value</th><th scope="col">COD due</th><th scope="col">Review / invoice</th></tr></thead><tbody>{shown.map(order => <tr key={order.id}><td><Link href={`/orders/${order.id}`}>{order.order_number}</Link><small>{dateKey(order.created_at)}</small></td><td>{order.customer_name}<small>{order.customer_state || "State missing"}</small></td><td><span className={styles.paymentTag}>{order.payment_type === "full" ? "Paid · Full" : "Paid · COD token"}</span><small>{order.shipping_status.replaceAll("_", " ")}</small></td><td>{money(order.amount_in_paise)}</td><td>{money(order.payment_type === "partial_cod" && order.cod_balance_status !== "collected" ? order.balance_due_in_paise : 0)}{order.payment_type === "partial_cod" && codNeedsReview(order) && <small>Under review</small>}</td><td>{reviewReasons(order).map(reason => <small key={reason} className={styles.reviewLink}>{reason}</small>)}<a href={`/api/orders/${order.id}/invoice`}>Invoice PDF ↗</a></td></tr>)}{!shown.length && <tr><td colSpan={6} className={styles.empty}>{tab === "all" ? "No paid orders for this month. Choose another month to view your accounts." : "No orders in this review queue."}</td></tr>}</tbody></table></div><div className={styles.pagination}><span>{filtered.length} orders · Page {page} of {pages}</span><div>{page > 1 && <Link href={`/accounts?month=${month}&view=${tab}&page=${page - 1}#register`}>← Previous</Link>}{page < pages && <Link href={`/accounts?month=${month}&view=${tab}&page=${page + 1}#register`}>Next →</Link>}</div></div></section>
  </main>;
}
function Metric({ title, value, note, accent }: { title: string; value: string; note: string; accent?: boolean }) {
  return <section className={`${styles.metric} ${accent ? styles.metricAccent : ""}`}><h2>{title}</h2><strong>{value}</strong><p>{note}</p></section>;
}

import Link from "next/link";
import Header from "./components/Header";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { parseCartItems, cartItemName } from "../lib/cartItems";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

const READY_STATUSES = ["pending", "confirmed", "packed"];
const UNPAID_STATUSES = ["pending", "failed"];

function formatINR(paise: number) {
  return `₹${((paise || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function dubaiBoundaries() {
  const shifted = new Date(Date.now() + 4 * 60 * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  return {
    today: new Date(Date.UTC(year, month, day) - 4 * 60 * 60 * 1000).toISOString(),
    month: new Date(Date.UTC(year, month, 1) - 4 * 60 * 60 * 1000).toISOString(),
  };
}

function itemSummary(raw: any) {
  const items = parseCartItems(raw);
  if (!items.length) return "No item details";
  return items
    .map((item: any) => `${Math.max(Number(item.quantity || item.qty || 1), 1)} × ${cartItemName(item) || "Item"}`)
    .join(", ");
}

function ageLabel(value: string) {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000));
  if (hours < 1) return "Less than 1 hour ago";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default async function Home() {
  const supabase = supabaseAdmin();
  const boundary = dubaiBoundaries();

  const [
    { data: todayOrders },
    { data: monthOrders },
    { data: readyOrders },
    { count: readyCount },
    { count: awaitingPaymentCount },
    { data: codOrders },
    { data: inventory },
    { count: unmappedInventoryCount },
  ] = await Promise.all([
    supabase.from("orders").select("amount_in_paise, payment_status").eq("is_hidden", false).gte("created_at", boundary.today),
    supabase.from("orders").select("amount_in_paise").eq("is_hidden", false).eq("payment_status", "paid").gte("created_at", boundary.month),
    supabase
      .from("orders")
      .select("id, order_number, customer_name, customer_city, items, amount_in_paise, shipping_status, created_at")
      .eq("is_hidden", false)
      .eq("payment_status", "paid")
      .in("shipping_status", READY_STATUSES)
      .order("created_at", { ascending: true })
      .limit(8),
    supabase.from("orders").select("*", { count: "exact", head: true }).eq("is_hidden", false).eq("payment_status", "paid").in("shipping_status", READY_STATUSES),
    supabase.from("orders").select("*", { count: "exact", head: true }).eq("is_hidden", false).in("payment_status", UNPAID_STATUSES).in("shipping_status", READY_STATUSES),
    supabase.from("orders").select("balance_due_in_paise").eq("is_hidden", false).eq("payment_type", "partial_cod").eq("cod_balance_status", "pending"),
    supabase.from("inventory_skus").select("id, product_name, size, current_stock, low_stock_threshold").eq("active", true).order("product_name"),
    supabase.from("inventory_unmapped_items").select("*", { count: "exact", head: true }),
  ]);

  const paidToday = (todayOrders || []).filter((order: any) => order.payment_status === "paid");
  const todayRevenue = paidToday.reduce((sum: number, order: any) => sum + (order.amount_in_paise || 0), 0);
  const monthRevenue = (monthOrders || []).reduce((sum: number, order: any) => sum + (order.amount_in_paise || 0), 0);
  const codDue = (codOrders || []).reduce((sum: number, order: any) => sum + (order.balance_due_in_paise || 0), 0);
  const lowStock = (inventory || []).filter((sku: any) => sku.current_stock <= sku.low_stock_threshold);

  const stockByProduct = new Map<string, any[]>();
  for (const sku of inventory || []) {
    const rows = stockByProduct.get(sku.product_name) || [];
    rows.push(sku);
    stockByProduct.set(sku.product_name, rows);
  }

  return (
    <main className={styles.page}>
      <Header active="home" />

      <section className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Operations dashboard</p>
          <h1>Today at House of Eon</h1>
          <p>{new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Dubai", weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <Link className={styles.primaryButton} href="/orders">Open paid order queue →</Link>
      </section>

      <section className={styles.kpis} aria-label="Today’s sales summary">
        <Kpi label="Paid orders today" value={String(paidToday.length)} note="Confirmed sales only" tone="green" href="/orders?view=all&payment=paid&date=today" />
        <Kpi label="Revenue today" value={formatINR(todayRevenue)} note="From paid orders" tone="blue" href="/orders?view=all&payment=paid&date=today" />
        <Kpi label="Ready to fulfil" value={String(readyCount || 0)} note="Paid and not shipped" tone="amber" href="/orders" />
        <Kpi label="Revenue this month" value={formatINR(monthRevenue)} note={`${(monthOrders || []).length} paid orders`} tone="purple" href="/orders?view=all&payment=paid&date=month" />
      </section>

      <div className={styles.mainGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.sectionLabel}>Do this next</p><h2>Paid orders ready to fulfil</h2><p>Oldest paid order appears first.</p></div>
            <Link href="/orders">View all {readyCount || 0}</Link>
          </div>
          <div className={styles.orderList}>
            {(readyOrders || []).map((order: any, index: number) => (
              <Link href={`/orders/${order.id}`} className={styles.orderRow} key={order.id}>
                <div className={styles.queueNumber}>{index + 1}</div>
                <div className={styles.orderMain}>
                  <div className={styles.orderTopline}><strong>{order.order_number}</strong><span className={styles.paidBadge}>Paid</span><span className={styles.statusBadge}>{String(order.shipping_status).replaceAll("_", " ")}</span></div>
                  <div className={styles.customerLine}>{order.customer_name}{order.customer_city ? ` · ${order.customer_city}` : ""}</div>
                  <div className={styles.itemLine}>{itemSummary(order.items)}</div>
                </div>
                <div className={styles.orderMeta}><strong>{formatINR(order.amount_in_paise)}</strong><span>{ageLabel(order.created_at)}</span><b>Open →</b></div>
              </Link>
            ))}
            {(readyOrders || []).length === 0 && <div className={styles.emptyState}><span>✓</span><strong>Fulfilment queue is clear</strong><p>There are no paid orders waiting right now.</p></div>}
          </div>
        </section>

        <aside className={styles.sideColumn}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.sectionLabel}>Needs attention</p><h2>Exceptions</h2></div></div>
            <Attention label="Awaiting payment" value={String(awaitingPaymentCount || 0)} detail="Do not fulfil these" href="/orders?view=payment_pending" warning={(awaitingPaymentCount || 0) > 0} />
            <Attention label="COD balance due" value={formatINR(codDue)} detail={`${(codOrders || []).length} orders`} href="/orders?view=all&payment_type=partial_cod" warning={codDue > 0} />
            <Attention label="Low-stock SKUs" value={String(lowStock.length)} detail="At or below warning level" href="/inventory" warning={lowStock.length > 0} />
            {(unmappedInventoryCount || 0) > 0 && <Attention label="Unmapped paid items" value={String(unmappedInventoryCount)} detail="Review before fulfilment" href="/inventory" warning />}
          </section>
        </aside>
      </div>

      {(inventory || []).length > 0 && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.sectionLabel}>Inventory</p><h2>Stock remaining</h2><p>Automatically reduced by paid orders only.</p></div><Link href="/inventory">Manage stock →</Link></div>
          <div className={styles.stockGrid}>
            {[...stockByProduct.entries()].map(([product, skus]) => (
              <Link href="/inventory" className={styles.stockCard} key={product}>
                <strong>{product}</strong>
                <div>{skus.sort((a, b) => a.size.localeCompare(b.size)).map((sku: any) => <span key={sku.id} className={sku.current_stock <= sku.low_stock_threshold ? styles.stockLow : ""}><small>{String(sku.size).toUpperCase()}</small><b>{sku.current_stock}</b></span>)}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Kpi({ label, value, note, tone, href }: { label: string; value: string; note: string; tone: string; href: string }) {
  return <Link href={href} className={`${styles.kpi} ${styles[tone]}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></Link>;
}

function Attention({ label, value, detail, href, warning }: { label: string; value: string; detail: string; href: string; warning: boolean }) {
  return <Link href={href} className={`${styles.attention} ${warning ? styles.attentionWarning : ""}`}><div><strong>{label}</strong><span>{detail}</span></div><b>{value}</b><em>→</em></Link>;
}

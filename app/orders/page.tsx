import Link from "next/link";
import { Fragment } from "react";
import Header from "../components/Header";
import OrderStatusQuickEdit from "../components/OrderStatusQuickEdit";
import CopyButton from "../components/CopyButton";
import HideOrderToggle from "../components/HideOrderToggle";
import CourierRefresh from "../components/CourierRefresh";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { parseCartItems, cartItemName } from "../../lib/cartItems";
import { normalizePhone } from "../../lib/phone";
import { isShiprocketEnabled } from "../../lib/shiprocket";
import styles from "./orders.module.css";

export const dynamic = "force-dynamic";

import { UNSHIPPED_STATUSES, ABANDONED_PAYMENT_STATUSES, REAL_ORDERS_FILTER, orderView, ordersQuery, dubaiDateKey } from "../../lib/ordersQuery";

function formatINR(paise: number) {
  return `₹${((paise || 0) / 100).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
}

function badge(value: string) {
  const colors: Record<string, any> = {
    paid: ["#dcfce7", "#166534"],
    pending: ["#fef9c3", "#854d0e"],
    failed: ["#fee2e2", "#991b1b"],
    refunded: ["#e5e7eb", "#374151"],
    cancelled: ["#fee2e2", "#991b1b"],
    confirmed: ["#dbeafe", "#1d4ed8"],
    packed: ["#dbeafe", "#1d4ed8"],
    shipped: ["#e0e7ff", "#3730a3"],
    out_for_delivery: ["#fce7f3", "#9d174d"],
    delivered: ["#dcfce7", "#166534"],
    delivery_disputed: ["#fee2e2", "#991b1b"],
    completed: ["#dcfce7", "#166534"],
    rejected: ["#fee2e2", "#991b1b"],
    return_requested: ["#ffedd5", "#9a3412"],
    returned: ["#e5e7eb", "#374151"],
    "no payment": ["#fee2e2", "#991b1b"],
    "payment failed": ["#fee2e2", "#991b1b"],
    "cod pending": ["#ffedd5", "#9a3412"],
  };

  const [bg, color] = colors[value] || ["#f3f4f6", "#374151"];

  return (
    <span
      style={{
        background: bg,
        color,
        padding: "5px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {value}
    </span>
  );
}

function paymentTypeTag(paymentType: string) {
  const isCod = paymentType === "partial_cod";
  return (
    <span
      style={{
        display: "inline-block",
        marginTop: 4,
        background: isCod ? "#ffedd5" : "#e0e7ff",
        color: isCod ? "#9a3412" : "#3730a3",
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {isCod ? "COD" : "Full Payment"}
    </span>
  );
}

// Order Status values from "shipped" onward that really ought to have a
// courier waybill attached by now — if one isn't, that Order Status was
// set manually and was never actually confirmed by either courier.
const STATUSES_EXPECTING_TRACKING = [
  "shipped",
  "out_for_delivery",
  "delivered",
  "delivery_disputed",
  "completed",
];

function courierStatusBadge(icon: string, rawStatus: string | null, syncedAt: string | null) {
  return (
    <div>
      <span
        style={{
          background: "#f3f4f6",
          color: "#374151",
          padding: "5px 10px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        {icon} {rawStatus || "Not synced yet"}
      </span>
      {syncedAt && (
        <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>
          synced {new Date(syncedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}

// Delivery Status is whichever courier's own reported status — read-only
// here, kept deliberately separate from the admin-editable Order Status
// column so an automatic sync can never look like (or actually be) an
// admin decision. An order ships via ONE courier or the other, so this
// just shows whichever waybill is actually attached.
function deliveryStatusCell(order: any) {
  if (order.delhivery_waybill) {
    return courierStatusBadge("🚚", order.delhivery_last_status_raw, order.delhivery_last_synced_at);
  }
  if (isShiprocketEnabled() && order.shiprocket_waybill) {
    return courierStatusBadge("📦", order.shiprocket_last_status_raw, order.shiprocket_last_synced_at);
  }
  if (STATUSES_EXPECTING_TRACKING.includes(order.shipping_status)) {
    return (
      <span
        title="Order Status says this shipped, but no courier waybill (Delhivery or Shiprocket) was ever attached — that status was set manually and isn't confirmed by either courier."
        style={{
          background: "#fef3c7",
          color: "#92400e",
          padding: "5px 10px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        ⚠️ No tracking
      </span>
    );
  }
  return <span style={{ color: "#bbb", fontSize: 13 }}>Not shipped</span>;
}

const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#dc2626", "#d97706", "#059669", "#0891b2"];

function avatar(name: string) {
  const letter = (name || "?").trim().charAt(0).toUpperCase() || "?";
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];

  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: color,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {letter}
    </div>
  );
}

function itemsPreview(items: any) {
  const list = parseCartItems(items);
  if (list.length === 0) return <span style={{ color: "#999" }}>-</span>;

  const first = cartItemName(list[0]) || "Item";
  const extra = list.length - 1;

  return (
    <span>
      {first}
      {extra > 0 ? ` +${extra} more` : ""}
    </span>
  );
}

function formatDateRange(from?: string, to?: string, preset?: string) {
  if (from || to) {
    const format = (value: string) =>
      new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    if (from && to) return `${format(from)} – ${format(to)}`;
    if (from) return `From ${format(from)}`;
    if (to) return `Until ${format(to)}`;
  }
  if (preset === "today") return "Today";
  if (preset === "7days") return "Last 7 days";
  if (preset === "month") return "This month";
  return "All dates";
}

function orderDayLabel(value: string) {
  const orderKey = dubaiDateKey(value);
  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (orderKey === dubaiDateKey(today)) return "Today";
  if (orderKey === dubaiDateKey(yesterday)) return "Yesterday";
  return new Date(value).toLocaleDateString("en-IN", {
    timeZone: "Asia/Dubai",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function Stat({ title, value, accent }: { title: string; value: any; accent: string }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 18,
        borderLeft: `4px solid ${accent}`,
      }}
    >
      <div style={{ color: "#777", fontSize: 13 }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{value}</div>
    </div>
  );
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    payment?: string;
    shipping?: string;
    payment_type?: string;
    date?: string;
    date_from?: string;
    date_to?: string;
    coupon?: string;
    view?: string;
    show_hidden?: string;
    bulk_sync?: string;
    checked?: string;
    matched?: string;
    updated?: string;
    unmatched?: string;
    shipments_returned?: string;
    sample_refs?: string;
    sample_unmatched?: string;
    shiprocket_checked?: string;
    shiprocket_matched?: string;
    shiprocket_updated?: string;
    bulk_sync_error?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = supabaseAdmin();

  const { isHiddenReview, isAbandonedPaymentView, isCodBalancePendingView, isDeliveredView, isDeliveryIssuesView, isAllView } = orderView(params);
  // Only show the "All Orders"-only filter fields (Order Status, Coupon)
  // when actually in All Orders mode — in the hidden-orders review list
  // those filters don't apply to anything, so hide them rather than show
  // dead controls.
  const showFullFilters = isAllView && !isHiddenReview;

  // So a quick inline status/hide change lands back on this same
  // filtered/searched/tab view instead of resetting to a blank /orders.
  // The bulk-sync result flags are excluded — they're a one-time banner,
  // not part of the filter/tab state that should persist across actions.
  const BULK_SYNC_KEYS = [
    "bulk_sync",
    "checked",
    "matched",
    "updated",
    "unmatched",
    "shipments_returned",
    "sample_refs",
    "sample_unmatched",
    "shiprocket_checked",
    "shiprocket_matched",
    "shiprocket_updated",
    "bulk_sync_error",
  ];
  const returnToQuery = new URLSearchParams(
    Object.entries(params).filter(([k, v]) => v && !BULK_SYNC_KEYS.includes(k)) as [string, string][]
  ).toString();
  const returnTo = returnToQuery ? `/orders?${returnToQuery}` : "/orders";

  // ------------------------------------------------------------------
  // Tab badge counts — cheap, exact, independent of the 300-row cap below.
  // ------------------------------------------------------------------

  const countsPromise = Promise.all([
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("is_hidden", false)
      .eq("payment_status", "paid")
      .in("shipping_status", UNSHIPPED_STATUSES),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("is_hidden", false)
      .in("payment_status", ABANDONED_PAYMENT_STATUSES)
      .in("shipping_status", UNSHIPPED_STATUSES),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("is_hidden", false)
      .eq("payment_status", "paid")
      .eq("payment_type", "partial_cod")
      .eq("cod_balance_status", "pending")
      .not("shipping_status", "in", "(cancelled,returned,refunded,rejected)"),
    supabase.from("orders").select("*", { count: "exact", head: true }).eq("is_hidden", true),
    supabase.from("orders").select("*", { count: "exact", head: true }).eq("is_hidden", false).or(REAL_ORDERS_FILTER),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("is_hidden", false)
      .eq("payment_status", "paid")
      .in("shipping_status", ["delivered", "completed"]),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("is_hidden", false)
      .eq("shipping_status", "delivery_disputed"),
  ]);

  // ------------------------------------------------------------------
  // Stats row — always reflects real, non-hidden business activity,
  // independent of whichever tab/filters are currently active.
  // ------------------------------------------------------------------

  const statsOrdersPromise = supabase
    .from("orders")
    .select(
      "amount_in_paise, payment_status, shipping_status, payment_type, token_amount_in_paise, cod_balance_status, balance_due_in_paise, created_at"
    )
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(300);

  // ------------------------------------------------------------------
  // Table query — respects the active tab + filters.
  // ------------------------------------------------------------------

  // Today is shown first, followed by yesterday and older work. Age remains
  // visible so old paid orders cannot disappear inside the queue.
  const query = ordersQuery(params).limit(300);

  const paidOrderCustomersPromise = supabase
    .from("orders")
    .select("customer_phone")
    .eq("payment_status", "paid")
    .limit(5000);

  // All independent database reads run together. Previously these were four
  // sequential Supabase round trips, making navigation wait even after the
  // courier calls moved to the background.
  const [
    { data: rawOrders, error },
    counts,
    { data: statsOrders },
    { data: paidOrderCustomers },
  ] = await Promise.all([query, countsPromise, statsOrdersPromise, paidOrderCustomersPromise]);

  const [
    { count: needsActionCount },
    { count: abandonedPaymentCount },
    { count: codBalancePendingCount },
    { count: hiddenCount },
    { count: visibleTotalCount },
    { count: deliveredCount },
    { count: deliveryIssuesCount },
  ] = counts;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayOrders = (statsOrders || []).filter((o: any) => new Date(o.created_at) >= todayStart);
  const paidToday = todayOrders.filter((o: any) => o.payment_status === "paid");
  const todayCollected = todayOrders.reduce((sum: number, o: any) => {
    if (o.payment_status !== "paid") return sum;
    if (o.payment_type !== "partial_cod" || o.cod_balance_status === "collected") {
      return sum + (o.amount_in_paise || 0);
    }
    return sum + (o.token_amount_in_paise || 0);
  }, 0);

  const orders = rawOrders || [];

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Orders</h1>
        <pre>{error.message}</pre>
      </main>
    );
  }

  // Count confirmed purchases by normalized phone number. This stays current
  // even if the separate customer-summary sync has not run yet, and avoids
  // treating abandoned/failed checkouts as repeat purchases.
  const customerOrderCounts = new Map<string, number>();
  for (const paidOrder of paidOrderCustomers || []) {
    const phone = normalizePhone(paidOrder.customer_phone || "");
    if (phone) customerOrderCounts.set(phone, (customerOrderCounts.get(phone) || 0) + 1);
  }

  const coupons = [...new Set((rawOrders || []).map((o: any) => o.coupon_code).filter(Boolean))];

  const hasFilters = !!(
    params.q ||
    params.payment ||
    params.shipping ||
    params.payment_type ||
    params.date ||
    params.date_from ||
    params.date_to ||
    params.coupon
  );

  function tabHref(next: { view?: string; show_hidden?: string }) {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.payment) qs.set("payment", params.payment);
    if (params.payment_type) qs.set("payment_type", params.payment_type);
    if (params.date) qs.set("date", params.date);
    if (params.date_from) qs.set("date_from", params.date_from);
    if (params.date_to) qs.set("date_to", params.date_to);
    if (params.coupon) qs.set("coupon", params.coupon);
    if (next.view) qs.set("view", next.view);
    if (next.show_hidden) qs.set("show_hidden", next.show_hidden);
    const s = qs.toString();
    return s ? `/orders?${s}` : "/orders";
  }

  function quickRangeHref(date: string) {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.payment) qs.set("payment", params.payment);
    if (params.shipping) qs.set("shipping", params.shipping);
    if (params.payment_type) qs.set("payment_type", params.payment_type);
    if (params.coupon) qs.set("coupon", params.coupon);
    if (params.view) qs.set("view", params.view);
    if (params.show_hidden) qs.set("show_hidden", params.show_hidden);
    qs.set("date", date);
    return `/orders?${qs.toString()}`;
  }

  const clearHref = isHiddenReview
    ? "/orders?show_hidden=1"
    : isAllView
    ? "/orders?view=all"
    : isDeliveredView
    ? "/orders?view=delivered"
    : isDeliveryIssuesView
    ? "/orders?view=delivery_issues"
    : isAbandonedPaymentView
    ? "/orders?view=abandoned_payment"
    : isCodBalancePendingView
    ? "/orders?view=cod_balance_pending"
    : "/orders?view=operations";

  const viewDescription = isHiddenReview
    ? "Test and spam records kept out of the live workflow."
    : isAbandonedPaymentView
    ? "Checkout leads with no confirmed payment. Retarget them, but do not fulfil them as orders."
    : isCodBalancePendingView
    ? "Real partial-COD orders where the token was paid and the remaining balance must be collected on delivery."
    : isDeliveredView
    ? "Confirmed delivered orders. Search by customer name, phone number, email or order number."
    : isDeliveryIssuesView
    ? "Customers who reported non-receipt even though the courier may show delivered. Resolve these before closing them."
    : isAllView
    ? "Search and audit all orders. Abandoned checkouts are kept in their own tab."
    : "All paid orders from today and yesterday, followed by any older order still waiting for fulfilment.";

  return (
    <main className={styles.page}>
      <Header active="orders" />

      <section className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Operations desk</p>
          <h1>Orders</h1>
          <p>{viewDescription}</p>
        </div>
        <div className={styles.summary}>
          <strong>{visibleTotalCount || 0}</strong>
          active order records
        </div>
      </section>

      {params.bulk_sync === "1" && (
        <div
          style={{
            background: params.bulk_sync_error ? "#fee2e2" : "#dcfce7",
            border: `1px solid ${params.bulk_sync_error ? "#fecaca" : "#bbf7d0"}`,
            color: params.bulk_sync_error ? "#991b1b" : "#166534",
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {params.bulk_sync_error ? (
            <>Bulk sync failed: {params.bulk_sync_error}</>
          ) : (
            <>
              <div>
                Courier sync complete. Delhivery checked {params.checked}, matched {params.matched}, updated{" "}
                {params.updated}. Shiprocket checked {params.shiprocket_checked || 0}, matched{" "}
                {params.shiprocket_matched || 0}, updated {params.shiprocket_updated || 0}.
                {Number(params.unmatched) > 0 && (
                  <> {params.unmatched} Delhivery order{params.unmatched === "1" ? "" : "s"} could not be matched.</>
                )}
              </div>

              {params.sample_refs && (
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  <b>Reference numbers Delhivery actually returned (sample):</b>{" "}
                  {params.sample_refs.split(",").join(", ")}
                </div>
              )}

              {params.sample_unmatched && (
                <div style={{ marginTop: 4, fontSize: 12 }}>
                  <b>Order numbers we couldn't match (sample):</b> {params.sample_unmatched.split(",").join(", ")}
                </div>
              )}

              {params.sample_refs && params.sample_unmatched && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#166534" }}>
                  Compare the two lists above — if the formatting looks different (case, dashes, extra
                  characters, a prefix/suffix Delhivery added), that mismatch is why matching fails even
                  though the shipment exists.
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className={styles.stats}>
        <Stat title="Paid orders today" value={paidToday.length} accent="#059669" />
        <Stat title="Collected today" value={formatINR(todayCollected)} accent="#2563eb" />
        <Stat title="Ready to fulfil" value={needsActionCount || 0} accent="#d97706" />
        <Stat title="Abandoned checkouts" value={abandonedPaymentCount || 0} accent="#991b1b" />
      </div>

      <section className={styles.workspace}>
      <div className={styles.queueBar}>
        <span className={styles.queueLabel}>Work queue</span>
        <Link href={tabHref({ view: "all" })} style={tabStyle(isAllView && !isHiddenReview)}>
          All Orders ({visibleTotalCount || 0})
        </Link>

        <Link
          href={tabHref({ view: "operations" })}
          style={tabStyle(!isAllView && !isHiddenReview && !isAbandonedPaymentView && !isCodBalancePendingView && !isDeliveredView && !isDeliveryIssuesView)}
        >
          Operations — Paid ({needsActionCount || 0} ready)
        </Link>
        <Link
          href={tabHref({ view: "abandoned_payment" })}
          style={tabStyle(isAbandonedPaymentView, true)}
        >
          Abandoned Checkouts ({abandonedPaymentCount || 0})
        </Link>
        <Link
          href={tabHref({ view: "cod_balance_pending" })}
          style={tabStyle(isCodBalancePendingView, true)}
        >
          COD Balance Pending ({codBalancePendingCount || 0})
        </Link>
        <Link href={tabHref({ view: "delivered" })} style={tabStyle(isDeliveredView)}>
          Delivered ({deliveredCount || 0})
        </Link>
        <Link href={tabHref({ view: "delivery_issues" })} style={tabStyle(isDeliveryIssuesView, true)}>
          ⚠ Delivery issues ({deliveryIssuesCount || 0})
        </Link>
        <div className={styles.queueSpacer} />
        <a href={`/api/orders/export?${returnToQuery}`} style={tabStyle(false)}>Download Excel</a>
        <CourierRefresh className={styles.syncForm} />
        <Link href={tabHref({ show_hidden: "1" })} style={tabStyle(isHiddenReview, true)}>
          🙈 Test/Hidden ({hiddenCount || 0})
        </Link>
      </div>

      {isAbandonedPaymentView && (
        <div style={{ margin: "0 14px 14px", padding: "12px 14px", borderRadius: 10, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", fontSize: 13 }}>
          <b>Recovery leads — no payment received.</b> These customers started checkout but no successful payment was recorded. Use WhatsApp to recover the sale; only move an order into fulfilment after payment is confirmed.
        </div>
      )}

      {isCodBalancePendingView && (
        <div style={{ margin: "0 14px 14px", padding: "12px 14px", borderRadius: 10, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", fontSize: 13 }}>
          <b>Confirmed COD orders.</b> The initial token was paid. The amount shown as due must be collected by the courier and then marked collected.
        </div>
      )}

      <details className={styles.filterPanel} open={hasFilters}>
        <summary>{hasFilters ? "Filters applied — open to change" : "Search or filter orders"}</summary>
      <form
        method="GET"
        className={`${styles.filters} ${!showFullFilters ? styles.filtersCompact : ""}`}
      >
        {params.view && <input type="hidden" name="view" value={params.view} />}
        {params.show_hidden && <input type="hidden" name="show_hidden" value={params.show_hidden} />}

        <div className={`${styles.field} ${styles.search}`}>
          <label>Search orders</label>
          <input
            name="q"
            defaultValue={params.q || ""}
            placeholder="Order #, customer, phone, email or city"
          />
        </div>

        <div className={styles.field}>
          <label>Payment</label>
          <select name="payment" defaultValue={params.payment || ""}>
            <option value="">Any status</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {showFullFilters && (
          <div className={styles.field}>
            <label>Fulfillment</label>
            <select name="shipping" defaultValue={params.shipping || ""}>
              <option value="">Any status</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="packed">Packed</option>
              <option value="shipped">Shipped</option>
              <option value="out_for_delivery">Out for delivery</option>
              <option value="delivered">Delivered</option>
              <option value="delivery_disputed">Delivery issue — not received</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="return_requested">Return requested</option>
              <option value="returned">Returned</option>
              <option value="refunded">Refunded</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        )}

        <div className={styles.field}>
          <label>Payment type</label>
          <select name="payment_type" defaultValue={params.payment_type || ""}>
            <option value="">Any type</option>
            <option value="full">Full</option>
            <option value="partial_cod">Partial (COD)</option>
          </select>
        </div>

        <div className={styles.field}>
          <label>From date</label>
          <input type="date" name="date_from" defaultValue={params.date_from || ""} />
        </div>

        <div className={styles.field}>
          <label>To date</label>
          <input type="date" name="date_to" defaultValue={params.date_to || ""} />
        </div>

        {showFullFilters && (
          <div className={styles.field}>
            <label>Coupon</label>
            <select name="coupon" defaultValue={params.coupon || ""}>
              <option value="">Any coupon</option>
              {coupons.map((c: any) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={styles.filterActions}>
          <button type="submit" className={styles.filterButton}>Apply</button>
          {hasFilters && <a href={clearHref} className={styles.clearButton}>Reset</a>}
        </div>
      </form>

      <div className={styles.quickRanges}>
        <span>Quick range:</span>
        <Link href={quickRangeHref("today")}>Today</Link>
        <Link href={quickRangeHref("7days")}>Last 7 days</Link>
        <Link href={quickRangeHref("month")}>This month</Link>
      </div>
      </details>
      </section>

      <section className={styles.workspace}>
        <div className={styles.resultsBar}>
          <span><strong>{orders.length}</strong> order{orders.length === 1 ? "" : "s"} shown</span>
          <span className={styles.rangeText}>{formatDateRange(params.date_from, params.date_to, params.date)}</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.ordersTable}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Fulfillment</th>
                <th>Courier</th>
                <th>Placed</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {orders.map((order: any, index: number) => {
                const whatsappPhone = normalizePhone(order.customer_phone || "");
                const customerOrderCount = customerOrderCounts.get(whatsappPhone) || 0;
                const codPending =
                  order.payment_status === "paid" && order.payment_type === "partial_cod" && order.cod_balance_status === "pending";
                const noPaymentConfirmed = ABANDONED_PAYMENT_STATUSES.includes(order.payment_status);

                const showDay = index === 0 || dubaiDateKey(order.created_at) !== dubaiDateKey(orders[index - 1].created_at);

                return (
                  <Fragment key={order.id}>
                  {showDay && (
                    <tr className={styles.dayDivider}>
                      <td colSpan={9}>{orderDayLabel(order.created_at)}</td>
                    </tr>
                  )}
                  <tr
                    style={order.is_hidden
                      ? { opacity: 0.6, background: "#fafafa" }
                      : order.shipping_status === "delivery_disputed"
                      ? { background: "#fff7ed" }
                      : undefined}
                  >
                    <td>
                      <Link href={`/orders/${order.id}`} className={styles.orderNumber}>
                        {order.order_number}
                      </Link>
                      {order.is_hidden && (
                        <div className={styles.subtle} style={{ color: "#9a3412" }}>
                          {order.hidden_reason || "Marked as test"}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className={styles.customer}>
                        {avatar(order.customer_name)}
                        <div className={styles.customerIdentity}>
                          <div className={styles.customerNameLine}>
                            <span className={styles.customerName}>{order.customer_name}</span>
                            {customerOrderCount > 1 && (
                              <span
                                className={styles.repeatBadge}
                                title={`${customerOrderCount} orders linked to this phone number`}
                              >
                                Repeat · {customerOrderCount} orders
                              </span>
                            )}
                          </div>
                          <div className={styles.subtle} style={{ display: "flex", alignItems: "center" }}>
                            {order.customer_phone}
                            <CopyButton text={order.customer_phone || ""} />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{itemsPreview(order.items)}</td>
                    <td>
                      <span className={styles.amount}>{formatINR(order.amount_in_paise)}</span>
                      {noPaymentConfirmed && <div className={styles.subtle}>Expected order value</div>}
                      {codPending && (
                        <div style={{ marginTop: 4 }}>
                          {badge("cod pending")}{" "}
                          <span style={{ fontSize: 12, color: "#9a3412" }}>
                            {formatINR(order.balance_due_in_paise)} due
                          </span>
                        </div>
                      )}
                    </td>
                    <td>
                      {noPaymentConfirmed ? badge(order.payment_status === "failed" ? "payment failed" : "no payment") : badge(order.payment_status)}
                      <div>{paymentTypeTag(order.payment_type)}</div>
                      {noPaymentConfirmed && (
                        <div className={styles.subtle} style={{ color: "#991b1b" }}>
                          {order.payment_type === "partial_cod" ? "Token not completed" : "Full payment not completed"}
                        </div>
                      )}
                    </td>
                    <td>
                      {isAbandonedPaymentView ? (
                        <div><span style={{ color: "#991b1b", fontWeight: 800 }}>⛔ Do not fulfil</span><div className={styles.subtle}>Open order if payment was received elsewhere</div></div>
                      ) : (
                        <OrderStatusQuickEdit
                          orderId={order.id}
                          paymentStatus={order.payment_status}
                          currentStatus={order.shipping_status}
                          trackingUrl={order.tracking_url}
                          notes={order.notes}
                          returnTo={returnTo}
                        />
                      )}
                    </td>
                    <td>{deliveryStatusCell(order)}</td>
                    <td className={styles.date}>
                      {new Date(order.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      <div className={styles.subtle}>
                        {new Date(order.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <Link href={`/orders/${order.id}`} className={styles.actionLink}>Open</Link>
                        {!noPaymentConfirmed && (
                          <a href={`/api/orders/${order.id}/invoice`} title="Download invoice" className={`${styles.actionLink} ${styles.iconLink}`}>
                            📄
                          </a>
                        )}
                        {whatsappPhone && (
                          <Link
                            href={`/inbox/${whatsappPhone}`}
                            title="Message on WhatsApp"
                            className={`${styles.actionLink} ${styles.iconLink}`}
                          >
                            {isAbandonedPaymentView ? "💬 Recover" : "💬"}
                          </Link>
                        )}
                        <HideOrderToggle orderId={order.id} hidden={!!order.is_hidden} returnTo={returnTo} />
                      </div>
                    </td>
                  </tr>
                  </Fragment>
                );
              })}

              {orders.length === 0 && (
                <tr>
                  <td className={styles.empty} colSpan={9}>
                    {isHiddenReview
                      ? "No test/hidden orders."
                      : isAbandonedPaymentView
                      ? "No abandoned checkouts right now."
                      : isCodBalancePendingView
                      ? "No COD balances are awaiting collection."
                      : isDeliveredView
                      ? "No delivered orders found."
                      : isDeliveryIssuesView
                      ? "No open delivery issues — good news."
                      : isAllView
                      ? "No orders found."
                      : "No paid orders today or yesterday, and no older paid orders need fulfilment."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {orders.length >= 300 && (
        <p className={styles.limitNote}>
          Showing latest 300 matching orders. Use search/filters to narrow it down.
        </p>
      )}
    </main>
  );
}

function tabStyle(active: boolean, danger?: boolean) {
  return {
    padding: "9px 16px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 700 as const,
    textDecoration: "none" as const,
    border: active ? "2px solid #111" : "1px solid #ddd",
    background: active ? (danger ? "#991b1b" : "#111") : "#fff",
    color: active ? "#fff" : danger ? "#991b1b" : "#374151",
  };
}

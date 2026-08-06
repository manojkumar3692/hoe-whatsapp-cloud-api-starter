import Link from "next/link";
import Header from "../components/Header";
import OrderStatusQuickEdit from "../components/OrderStatusQuickEdit";
import CopyButton from "../components/CopyButton";
import HideOrderToggle from "../components/HideOrderToggle";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { parseCartItems, cartItemName } from "../../lib/cartItems";
import { normalizePhone } from "../../lib/phone";

export const dynamic = "force-dynamic";

const UNSHIPPED_STATUSES = ["pending", "confirmed", "packed"];

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
    completed: ["#dcfce7", "#166534"],
    rejected: ["#fee2e2", "#991b1b"],
    return_requested: ["#ffedd5", "#9a3412"],
    returned: ["#e5e7eb", "#374151"],
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
// Delhivery waybill attached by now — if one isn't, that Order Status was
// set manually and was never actually confirmed against Delhivery.
const STATUSES_EXPECTING_TRACKING = ["shipped", "out_for_delivery", "delivered", "completed"];

// Delivery Status is Delhivery's own reported status — read-only here, kept
// deliberately separate from the admin-editable Order Status column so an
// automatic sync can never look like (or actually be) an admin decision.
function deliveryStatusCell(order: any) {
  if (!order.delhivery_waybill) {
    if (STATUSES_EXPECTING_TRACKING.includes(order.shipping_status)) {
      return (
        <span
          title="Order Status says this shipped, but no Delhivery waybill was ever attached — that status was set manually and isn't confirmed by Delhivery."
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
  if (!order.delhivery_last_status_raw) {
    return <span style={{ color: "#999", fontSize: 13 }}>Not synced yet</span>;
  }
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
        {order.delhivery_last_status_raw}
      </span>
      {order.delhivery_last_synced_at && (
        <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>
          synced {new Date(order.delhivery_last_synced_at).toLocaleString()}
        </div>
      )}
    </div>
  );
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

function getStartDate(range?: string) {
  const now = new Date();

  if (range === "today") {
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }

  if (range === "7days") {
    now.setDate(now.getDate() - 7);
    return now.toISOString();
  }

  if (range === "month") {
    now.setDate(1);
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }

  return null;
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
    bulk_sync_error?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = supabaseAdmin();

  const isHiddenReview = params.show_hidden === "1";
  const isAllView = params.view === "all" || isHiddenReview;
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
    "bulk_sync_error",
  ];
  const returnToQuery = new URLSearchParams(
    Object.entries(params).filter(([k, v]) => v && !BULK_SYNC_KEYS.includes(k)) as [string, string][]
  ).toString();
  const returnTo = returnToQuery ? `/orders?${returnToQuery}` : "/orders";

  // ------------------------------------------------------------------
  // Tab badge counts — cheap, exact, independent of the 300-row cap below.
  // ------------------------------------------------------------------

  const [{ count: needsActionCount }, { count: hiddenCount }, { count: visibleTotalCount }] =
    await Promise.all([
      supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("is_hidden", false)
        .in("shipping_status", UNSHIPPED_STATUSES),
      supabase.from("orders").select("*", { count: "exact", head: true }).eq("is_hidden", true),
      supabase.from("orders").select("*", { count: "exact", head: true }).eq("is_hidden", false),
    ]);

  // ------------------------------------------------------------------
  // Stats row — always reflects real, non-hidden business activity,
  // independent of whichever tab/filters are currently active.
  // ------------------------------------------------------------------

  const { data: statsOrders } = await supabase
    .from("orders")
    .select(
      "amount_in_paise, payment_status, shipping_status, payment_type, cod_balance_status, balance_due_in_paise, created_at"
    )
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(300);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayOrders = (statsOrders || []).filter((o: any) => new Date(o.created_at) >= todayStart);

  const todayRevenue = todayOrders.reduce(
    (sum: number, o: any) => (o.payment_status === "paid" ? sum + (o.amount_in_paise || 0) : sum),
    0
  );

  const pendingShipping = (statsOrders || []).filter(
    (o: any) => o.payment_status === "paid" && ["pending", "packed"].includes(o.shipping_status)
  ).length;

  const delivered = (statsOrders || []).filter((o: any) => o.shipping_status === "delivered").length;

  const codPendingOrders = (statsOrders || []).filter(
    (o: any) => o.payment_type === "partial_cod" && o.cod_balance_status === "pending"
  );

  const codPendingAmount = codPendingOrders.reduce(
    (sum: number, o: any) => sum + (o.balance_due_in_paise || 0),
    0
  );

  const paymentIssues = (statsOrders || []).filter((o: any) =>
    ["failed", "pending"].includes(o.payment_status)
  ).length;

  // ------------------------------------------------------------------
  // Table query — respects the active tab + filters.
  // ------------------------------------------------------------------

  let query = supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(300);

  if (isHiddenReview) {
    query = query.eq("is_hidden", true);
  } else {
    query = query.eq("is_hidden", false);

    if (isAllView) {
      if (params.shipping) {
        query = query.eq("shipping_status", params.shipping);
      }
    } else {
      query = query.in("shipping_status", UNSHIPPED_STATUSES);
    }
  }

  if (params.payment) {
    query = query.eq("payment_status", params.payment);
  }

  if (params.payment_type) {
    query = query.eq("payment_type", params.payment_type);
  }

  if (params.coupon) {
    query = query.eq("coupon_code", params.coupon);
  }

  const startDate = getStartDate(params.date);
  if (startDate) {
    query = query.gte("created_at", startDate);
  }

  const { data: rawOrders, error } = await query;

  let orders = rawOrders || [];

  if (params.q) {
    const q = params.q.toLowerCase();
    orders = orders.filter((o: any) =>
      [o.order_number, o.customer_name, o.customer_phone, o.customer_email, o.customer_city]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Orders</h1>
        <pre>{error.message}</pre>
      </main>
    );
  }

  const coupons = [...new Set((rawOrders || []).map((o: any) => o.coupon_code).filter(Boolean))];

  const hasFilters = !!(
    params.q ||
    params.payment ||
    params.shipping ||
    params.payment_type ||
    params.date ||
    params.coupon
  );

  function tabHref(next: { view?: string; show_hidden?: string }) {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.payment) qs.set("payment", params.payment);
    if (params.payment_type) qs.set("payment_type", params.payment_type);
    if (params.date) qs.set("date", params.date);
    if (params.coupon) qs.set("coupon", params.coupon);
    if (next.view) qs.set("view", next.view);
    if (next.show_hidden) qs.set("show_hidden", next.show_hidden);
    const s = qs.toString();
    return s ? `/orders?${s}` : "/orders";
  }

  return (
    <main style={{ padding: 24, background: "#fafafa", minHeight: "100vh" }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `.order-row:hover { background: #fafafa; }`,
        }}
      />

      <Header active="orders" />

      <h1 style={{ marginBottom: 4 }}>Orders</h1>
      <p style={{ color: "#666", marginBottom: 20 }}>
        {isHiddenReview
          ? "Orders marked as test/spam — hidden from the normal list, not deleted."
          : "New orders land here first. Confirm, pack, and ship them, then they drop off this view automatically."}
      </p>

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
                Checked {params.checked} order{params.checked === "1" ? "" : "s"} missing tracking against
                Delhivery by Order ID — Delhivery returned {params.shipments_returned || 0} shipment
                {params.shipments_returned === "1" ? "" : "s"} total, matched {params.matched}, updated{" "}
                {params.updated}.
                {Number(params.unmatched) > 0 && (
                  <> {params.unmatched} had no matching shipment in Delhivery.</>
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <Stat title="Today's Revenue" value={formatINR(todayRevenue)} accent="#2563eb" />
        <Stat title="Today's Orders" value={todayOrders.length} accent="#059669" />
        <Stat title="Pending Shipping" value={pendingShipping} accent="#d97706" />
        <Stat title="Delivered" value={delivered} accent="#16a34a" />
        <Stat
          title="COD Balance Pending"
          value={`${codPendingOrders.length} (${formatINR(codPendingAmount)})`}
          accent="#9a3412"
        />
        <Stat title="Payment Issues" value={paymentIssues} accent="#991b1b" />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Link href={tabHref({})} style={tabStyle(!isAllView && !isHiddenReview)}>
          🔔 Needs Action ({needsActionCount || 0})
        </Link>
        <Link href={tabHref({ view: "all" })} style={tabStyle(isAllView && !isHiddenReview)}>
          All Orders ({visibleTotalCount || 0})
        </Link>
        <div style={{ flex: 1 }} />
        <form
          action="/api/orders/bulk-sync-delhivery"
          method="POST"
          style={{ display: "flex", gap: 6, alignItems: "center" }}
          title="Looks up every order missing a waybill in Delhivery by Order Number (the reference you used when creating shipments in Delhivery One), and fills in tracking + status automatically on a match."
        >
          <input type="hidden" name="return_to" value={returnTo} />
          <input
            name="admin_password"
            type="password"
            placeholder="Admin password"
            required
            style={{ padding: "9px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, width: 130 }}
          />
          <button
            type="submit"
            style={{
              padding: "9px 14px",
              borderRadius: 999,
              border: "1px solid #ddd",
              background: "#fff",
              color: "#374151",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            🔄 Sync tracking by Order ID
          </button>
        </form>
        <Link href={tabHref({ show_hidden: "1" })} style={tabStyle(isHiddenReview, true)}>
          🙈 Test/Hidden ({hiddenCount || 0})
        </Link>
      </div>

      <form
        method="GET"
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 16,
          marginBottom: 20,
          display: "grid",
          gridTemplateColumns: showFullFilters
            ? "2fr 1fr 1fr 1fr 1fr 1fr auto auto"
            : "2fr 1fr 1fr 1fr auto auto",
          gap: 12,
          alignItems: "end",
        }}
      >
        {params.view && <input type="hidden" name="view" value={params.view} />}
        {params.show_hidden && <input type="hidden" name="show_hidden" value={params.show_hidden} />}

        <div>
          <label style={label}>Search</label>
          <input
            name="q"
            defaultValue={params.q || ""}
            placeholder="Order no, name, phone..."
            style={input}
          />
        </div>

        <div>
          <label style={label}>Payment</label>
          <select name="payment" defaultValue={params.payment || ""} style={input}>
            <option value="">All</option>
            <option value="paid">paid</option>
            <option value="pending">pending</option>
            <option value="failed">failed</option>
            <option value="refunded">refunded</option>
            <option value="cancelled">cancelled</option>
          </select>
        </div>

        {showFullFilters && (
          <div>
            <label style={label}>Order Status</label>
            <select name="shipping" defaultValue={params.shipping || ""} style={input}>
              <option value="">All</option>
              <option value="pending">pending</option>
              <option value="confirmed">confirmed</option>
              <option value="packed">packed</option>
              <option value="shipped">shipped</option>
              <option value="out_for_delivery">out_for_delivery</option>
              <option value="delivered">delivered</option>
              <option value="completed">completed</option>
              <option value="cancelled">cancelled</option>
              <option value="return_requested">return_requested</option>
              <option value="returned">returned</option>
              <option value="refunded">refunded</option>
              <option value="rejected">rejected</option>
            </select>
          </div>
        )}

        <div>
          <label style={label}>Payment Type</label>
          <select name="payment_type" defaultValue={params.payment_type || ""} style={input}>
            <option value="">All</option>
            <option value="full">Full</option>
            <option value="partial_cod">Partial (COD)</option>
          </select>
        </div>

        <div>
          <label style={label}>Date</label>
          <select name="date" defaultValue={params.date || ""} style={input}>
            <option value="">All</option>
            <option value="today">Today</option>
            <option value="7days">Last 7 days</option>
            <option value="month">This month</option>
          </select>
        </div>

        {showFullFilters && (
          <div>
            <label style={label}>Coupon</label>
            <select name="coupon" defaultValue={params.coupon || ""} style={input}>
              <option value="">All</option>
              {coupons.map((c: any) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          type="submit"
          style={{
            padding: "11px 18px",
            borderRadius: 8,
            border: 0,
            background: "#111",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Filter
        </button>

        {hasFilters && (
          <a
            href={isAllView ? "/orders?view=all" : "/orders"}
            style={{
              padding: "11px 18px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fff",
              color: "#111",
              fontWeight: 600,
              textDecoration: "none",
              textAlign: "center",
            }}
          >
            Clear
          </a>
        )}
      </form>

      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1350 }}>
            <thead style={{ background: "#f9fafb" }}>
              <tr>
                <th style={th}>Order</th>
                <th style={th}>Customer</th>
                <th style={th}>Items</th>
                <th style={th}>Amount</th>
                <th style={th}>Payment</th>
                <th style={th}>Order Status</th>
                <th style={th}>Delivery Status</th>
                <th style={th}>Date</th>
                <th style={th}>Action</th>
              </tr>
            </thead>

            <tbody>
              {orders.map((order: any) => {
                const whatsappPhone = normalizePhone(order.customer_phone || "");
                const codPending =
                  order.payment_type === "partial_cod" && order.cod_balance_status === "pending";

                return (
                  <tr
                    key={order.id}
                    className="order-row"
                    style={order.is_hidden ? { opacity: 0.6, background: "#fafafa" } : undefined}
                  >
                    <td style={td}>
                      <b>{order.order_number}</b>
                      {order.is_hidden && (
                        <div style={{ fontSize: 11, color: "#9a3412", marginTop: 2 }}>
                          {order.hidden_reason || "Marked as test"}
                        </div>
                      )}
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {avatar(order.customer_name)}
                        <div>
                          <div style={{ fontWeight: 700 }}>{order.customer_name}</div>
                          <div style={{ color: "#888", fontSize: 12, display: "flex", alignItems: "center" }}>
                            {order.customer_phone}
                            <CopyButton text={order.customer_phone || ""} />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={td}>{itemsPreview(order.items)}</td>
                    <td style={td}>
                      <b>{formatINR(order.amount_in_paise)}</b>
                      {codPending && (
                        <div style={{ marginTop: 4 }}>
                          {badge("cod pending")}{" "}
                          <span style={{ fontSize: 12, color: "#9a3412" }}>
                            {formatINR(order.balance_due_in_paise)} due
                          </span>
                        </div>
                      )}
                    </td>
                    <td style={td}>
                      {badge(order.payment_status)}
                      <div>{paymentTypeTag(order.payment_type)}</div>
                    </td>
                    <td style={td}>
                      <OrderStatusQuickEdit
                        orderId={order.id}
                        paymentStatus={order.payment_status}
                        currentStatus={order.shipping_status}
                        trackingUrl={order.tracking_url}
                        notes={order.notes}
                        returnTo={returnTo}
                      />
                    </td>
                    <td style={td}>{deliveryStatusCell(order)}</td>
                    <td style={td}>{new Date(order.created_at).toLocaleString()}</td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <Link href={`/orders/${order.id}`}>View</Link>
                        <a href={`/api/orders/${order.id}/invoice`} title="Download invoice">
                          📄
                        </a>
                        {whatsappPhone && (
                          <Link
                            href={`/inbox/${whatsappPhone}`}
                            title="Message on WhatsApp"
                            style={{ textDecoration: "none" }}
                          >
                            💬
                          </Link>
                        )}
                        <HideOrderToggle orderId={order.id} hidden={!!order.is_hidden} returnTo={returnTo} />
                      </div>
                    </td>
                  </tr>
                );
              })}

              {orders.length === 0 && (
                <tr>
                  <td style={td} colSpan={8}>
                    {isHiddenReview
                      ? "No test/hidden orders."
                      : isAllView
                      ? "No orders found."
                      : "Nothing needs action right now — every order has moved past pending/confirmed/packed. Check \"All Orders\" to see everything."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {orders.length >= 300 && (
        <p style={{ color: "#999", fontSize: 13, marginTop: 12 }}>
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

const label = {
  display: "block",
  fontSize: 12,
  color: "#666",
  marginBottom: 6,
};

const input = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "1px solid #ddd",
  boxSizing: "border-box" as const,
};

const th = {
  textAlign: "left" as const,
  padding: 12,
  borderBottom: "1px solid #e5e7eb",
  fontSize: 13,
  color: "#555",
  whiteSpace: "nowrap" as const,
};

const td = {
  padding: 12,
  borderBottom: "1px solid #f1f1f1",
  fontSize: 14,
};

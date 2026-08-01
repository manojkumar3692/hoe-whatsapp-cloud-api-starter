import Link from "next/link";
import Header from "../components/Header";
import OrderStatusQuickEdit from "../components/OrderStatusQuickEdit";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { parseCartItems, cartItemName } from "../../lib/cartItems";
import { normalizePhone } from "../../lib/phone";

export const dynamic = "force-dynamic";

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
  }>;
}) {
  const params = await searchParams;
  const supabase = supabaseAdmin();

  // So a quick inline status change (below) lands back on this same
  // filtered/searched view instead of resetting to a blank /orders.
  const returnToQuery = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][]
  ).toString();
  const returnTo = returnToQuery ? `/orders?${returnToQuery}` : "/orders";

  const [{ count: totalCount }] = await Promise.all([
    supabase.from("orders").select("*", { count: "exact", head: true }),
  ]);

  let query = supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  if (params.payment) {
    query = query.eq("payment_status", params.payment);
  }

  if (params.shipping) {
    query = query.eq("shipping_status", params.shipping);
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
      [
        o.order_number,
        o.customer_name,
        o.customer_phone,
        o.customer_email,
        o.customer_city,
      ]
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

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayOrders = orders.filter(
    (o: any) => new Date(o.created_at) >= todayStart
  );

  const todayRevenue = todayOrders.reduce(
    (sum: number, o: any) =>
      o.payment_status === "paid" ? sum + (o.amount_in_paise || 0) : sum,
    0
  );

  const pendingShipping = orders.filter(
    (o: any) =>
      o.payment_status === "paid" &&
      ["pending", "packed"].includes(o.shipping_status)
  ).length;

  const delivered = orders.filter(
    (o: any) => o.shipping_status === "delivered"
  ).length;

  const codPendingOrders = orders.filter(
    (o: any) => o.payment_type === "partial_cod" && o.cod_balance_status === "pending"
  );

  const codPendingAmount = codPendingOrders.reduce(
    (sum: number, o: any) => sum + (o.balance_due_in_paise || 0),
    0
  );

  const paymentIssues = orders.filter((o: any) =>
    ["failed", "pending"].includes(o.payment_status)
  ).length;

  const coupons = [
    ...new Set((rawOrders || []).map((o: any) => o.coupon_code).filter(Boolean)),
  ];

  const hasFilters = !!(
    params.q ||
    params.payment ||
    params.shipping ||
    params.payment_type ||
    params.date ||
    params.coupon
  );

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
        Every order, payment, and shipment in one place.
      </p>

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

      <form
        method="GET"
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 16,
          marginBottom: 20,
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr auto auto",
          gap: 12,
          alignItems: "end",
        }}
      >
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
            href="/orders"
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
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
            <thead style={{ background: "#f9fafb" }}>
              <tr>
                <th style={th}>Order</th>
                <th style={th}>Customer</th>
                <th style={th}>Items</th>
                <th style={th}>Amount</th>
                <th style={th}>Payment</th>
                <th style={th}>Order Status</th>
                <th style={th}>Coupon</th>
                <th style={th}>Date</th>
                <th style={th}>Action</th>
              </tr>
            </thead>

            <tbody>
              {orders.map((order: any) => {
                const whatsappPhone = normalizePhone(order.customer_phone || "");
                const codPending =
                  order.payment_type === "partial_cod" &&
                  order.cod_balance_status === "pending";

                return (
                  <tr key={order.id} className="order-row">
                    <td style={td}>
                      <b>{order.order_number}</b>
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {avatar(order.customer_name)}
                        <div>
                          <div style={{ fontWeight: 700 }}>{order.customer_name}</div>
                          <div style={{ color: "#888", fontSize: 12 }}>
                            {order.customer_phone}
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
                    <td style={td}>{badge(order.payment_status)}</td>
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
                    <td style={td}>{order.coupon_code || "-"}</td>
                    <td style={td}>{new Date(order.created_at).toLocaleString()}</td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <Link href={`/orders/${order.id}`}>View</Link>
                        {whatsappPhone && (
                          <Link
                            href={`/inbox/${whatsappPhone}`}
                            title="Message on WhatsApp"
                            style={{ textDecoration: "none" }}
                          >
                            💬
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {orders.length === 0 && (
                <tr>
                  <td style={td} colSpan={9}>
                    No orders found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalCount && totalCount > 300 && (
        <p style={{ color: "#999", fontSize: 13, marginTop: 12 }}>
          Showing latest 300 of {totalCount} orders. Use search/filters to narrow it down.
        </p>
      )}
    </main>
  );
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

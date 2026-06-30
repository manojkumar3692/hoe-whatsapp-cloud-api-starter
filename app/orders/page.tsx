import Link from "next/link";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function formatINR(paise: number) {
  return `₹${((paise || 0) / 100).toFixed(0)}`;
}

function badge(value: string) {
  const colors: Record<string, any> = {
    paid: ["#dcfce7", "#166534"],
    pending: ["#fef9c3", "#854d0e"],
    failed: ["#fee2e2", "#991b1b"],
    refunded: ["#e5e7eb", "#374151"],
    cancelled: ["#fee2e2", "#991b1b"],
    packed: ["#dbeafe", "#1d4ed8"],
    shipped: ["#e0e7ff", "#3730a3"],
    out_for_delivery: ["#fce7f3", "#9d174d"],
    delivered: ["#dcfce7", "#166534"],
    rejected: ["#fee2e2", "#991b1b"],
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

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    payment?: string;
    shipping?: string;
    date?: string;
    coupon?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = supabaseAdmin();

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

  const coupons = [
    ...new Set((rawOrders || []).map((o: any) => o.coupon_code).filter(Boolean)),
  ];

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Orders</h1>
        <pre>{error.message}</pre>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, background: "#fafafa", minHeight: "100vh" }}>
      <nav style={{ marginBottom: 24 }}>
        <Link href="/">Home</Link>{" | "}
        <Link href="/customers">Customers</Link>{" | "}
        <Link href="/campaigns">Campaigns</Link>{" | "}
        <Link href="/inbox">Inbox</Link>{" | "}
        <Link href="/campaign-history">Campaign History</Link>
      </nav>

      <h1 style={{ marginBottom: 20 }}>Orders</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <Stat title="Today's Revenue" value={formatINR(todayRevenue)} />
        <Stat title="Today's Orders" value={todayOrders.length} />
        <Stat title="Pending Shipping" value={pendingShipping} />
        <Stat title="Delivered" value={delivered} />
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
          gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto",
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
          <label style={label}>Shipping</label>
          <select name="shipping" defaultValue={params.shipping || ""} style={input}>
            <option value="">All</option>
            <option value="pending">pending</option>
            <option value="packed">packed</option>
            <option value="shipped">shipped</option>
            <option value="out_for_delivery">out_for_delivery</option>
            <option value="delivered">delivered</option>
            <option value="cancelled">cancelled</option>
            <option value="rejected">rejected</option>
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
      </form>

      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#f9fafb" }}>
            <tr>
              <th style={th}>Order</th>
              <th style={th}>Customer</th>
              <th style={th}>Phone</th>
              <th style={th}>Amount</th>
              <th style={th}>Payment</th>
              <th style={th}>Shipping</th>
              <th style={th}>Coupon</th>
              <th style={th}>Date</th>
              <th style={th}>Action</th>
            </tr>
          </thead>

          <tbody>
            {orders.map((order: any) => (
              <tr key={order.id}>
                <td style={td}>
                  <b>{order.order_number}</b>
                </td>
                <td style={td}>{order.customer_name}</td>
                <td style={td}>{order.customer_phone}</td>
                <td style={td}>
                  <b>{formatINR(order.amount_in_paise)}</b>
                </td>
                <td style={td}>{badge(order.payment_status)}</td>
                <td style={td}>{badge(order.shipping_status)}</td>
                <td style={td}>{order.coupon_code || "-"}</td>
                <td style={td}>{new Date(order.created_at).toLocaleString()}</td>
                <td style={td}>
                  <Link href={`/orders/${order.id}`}>View</Link>
                </td>
              </tr>
            ))}

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
    </main>
  );
}

function Stat({ title, value }: { title: string; value: any }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 18,
      }}
    >
      <div style={{ color: "#777", fontSize: 13 }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{value}</div>
    </div>
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
};

const th = {
  textAlign: "left" as const,
  padding: 12,
  borderBottom: "1px solid #e5e7eb",
  fontSize: 13,
  color: "#555",
};

const td = {
  padding: 12,
  borderBottom: "1px solid #f1f1f1",
  fontSize: 14,
};
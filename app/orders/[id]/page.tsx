import Link from "next/link";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function formatINR(paise: number) {
  return `₹${((paise || 0) / 100).toFixed(0)}`;
}

function StatusBadge({ value }: { value: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    paid: { bg: "#dcfce7", color: "#166534" },
    pending: { bg: "#fef9c3", color: "#854d0e" },
    failed: { bg: "#fee2e2", color: "#991b1b" },
    refunded: { bg: "#e5e7eb", color: "#374151" },
    cancelled: { bg: "#fee2e2", color: "#991b1b" },
    packed: { bg: "#dbeafe", color: "#1d4ed8" },
    shipped: { bg: "#e0e7ff", color: "#3730a3" },
    out_for_delivery: { bg: "#fce7f3", color: "#9d174d" },
    delivered: { bg: "#dcfce7", color: "#166534" },
    rejected: { bg: "#fee2e2", color: "#991b1b" },
  };

  const style = colors[value] || { bg: "#f3f4f6", color: "#374151" };

  return (
    <span
      style={{
        background: style.bg,
        color: style.color,
        padding: "6px 12px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {value}
    </span>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: "#777" }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value || "-"}</div>
    </div>
  );
}

const card = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 18,
};

const input = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "1px solid #ddd",
  marginTop: 6,
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !order) {
    return (
      <main style={{ padding: 24 }}>
        <Link href="/orders">← Orders</Link>
        <h1>Order not found</h1>
        <pre>{error?.message}</pre>
      </main>
    );
  }

  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <main style={{ padding: 24, background: "#fafafa", minHeight: "100vh" }}>
      <nav style={{ marginBottom: 24 }}>
        <Link href="/orders">← Orders</Link>{" | "}
        <Link href="/customers">Customers</Link>{" | "}
        <Link href="/inbox">Inbox</Link>
      </nav>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h1>Order {order.order_number}</h1>
          <p style={{ color: "#666" }}>
            Created: {new Date(order.created_at).toLocaleString()}
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <StatusBadge value={order.payment_status} />
          <StatusBadge value={order.shipping_status} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16 }}>
        <section style={card}>
          <h2>Customer</h2>
          <Info label="Name" value={order.customer_name} />
          <Info label="Phone" value={order.customer_phone} />
          <Info label="Email" value={order.customer_email} />
          <Info label="Address" value={order.customer_address} />
          <Info
            label="City / State / Pincode"
            value={[order.customer_city, order.customer_state, order.customer_pincode]
              .filter(Boolean)
              .join(", ")}
          />
        </section>

        <section style={card}>
          <h2>Payment Summary</h2>
          <Info label="Subtotal" value={formatINR(order.subtotal_in_paise)} />
          <Info label="Discount" value={formatINR(order.coupon_discount_in_paise)} />
          <Info label="Total" value={formatINR(order.amount_in_paise)} />
          <Info label="Coupon" value={order.coupon_code || "-"} />
          <Info label="Payment Status" value={<StatusBadge value={order.payment_status} />} />
        </section>
      </div>

      <section style={{ ...card, marginTop: 16 }}>
        <h2>Items</h2>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Product</th>
              <th style={th}>Quantity</th>
              <th style={th}>Price</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, index: number) => (
              <tr key={index}>
                <td style={td}>
                  {item.name || item.title || item.product || item.product_name || "Item"}
                </td>
                <td style={td}>{item.quantity || item.qty || 1}</td>
                <td style={td}>
                  {item.price_in_paise
                    ? formatINR(item.price_in_paise)
                    : item.price
                    ? `₹${item.price}`
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {items.length === 0 && <p style={{ color: "#777" }}>No items found.</p>}
      </section>

      <section style={{ ...card, marginTop: 16 }}>
        <h2>Shipping</h2>
        <Info label="Shipping Status" value={<StatusBadge value={order.shipping_status} />} />
        <Info
          label="Tracking URL"
          value={
            order.tracking_url ? (
              <a href={order.tracking_url} target="_blank">
                {order.tracking_url}
              </a>
            ) : (
              "-"
            )
          }
        />
        <Info label="Notes" value={order.notes || "-"} />
      </section>

      <section style={{ ...card, marginTop: 16 }}>
        <h2>Update Order</h2>

        <form action="/api/orders/update" method="POST">
          <input type="hidden" name="id" value={order.id} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label>Payment Status</label>
              <select name="payment_status" defaultValue={order.payment_status} style={input}>
                <option value="pending">pending</option>
                <option value="paid">paid</option>
                <option value="failed">failed</option>
                <option value="refunded">refunded</option>
                <option value="cancelled">cancelled</option>
              </select>
            </div>

            <div>
              <label>Shipping Status</label>
              <select name="shipping_status" defaultValue={order.shipping_status} style={input}>
                <option value="pending">pending</option>
                <option value="packed">packed</option>
                <option value="shipped">shipped</option>
                <option value="out_for_delivery">out_for_delivery</option>
                <option value="delivered">delivered</option>
                <option value="cancelled">cancelled</option>
                <option value="rejected">rejected</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label>Tracking URL</label>
            <input
              name="tracking_url"
              defaultValue={order.tracking_url || ""}
              placeholder="https://..."
              style={input}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <label>Notes</label>
            <textarea
              name="notes"
              defaultValue={order.notes || ""}
              rows={4}
              style={input}
            />
          </div>

          <button
            type="submit"
            style={{
              marginTop: 16,
              padding: "12px 22px",
              borderRadius: 8,
              border: 0,
              background: "#111",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Update Order
          </button>
        </form>
      </section>
    </main>
  );
}

const th = {
  textAlign: "left" as const,
  borderBottom: "1px solid #e5e7eb",
  padding: 10,
  fontSize: 13,
  color: "#555",
};

const td = {
  borderBottom: "1px solid #f1f1f1",
  padding: 10,
};
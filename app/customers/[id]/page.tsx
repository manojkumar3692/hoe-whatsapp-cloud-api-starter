import Link from "next/link";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function formatINR(paise: number) {
  return `₹${((paise || 0) / 100).toFixed(0)}`;
}

function badge(text: string, bg: string, color: string) {
  return (
    <span style={{ background: bg, color, padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
      {text}
    </span>
  );
}

function healthBadge(customer: any) {
  const health = customer?.marketing_health || "healthy";
  if (health === "cooldown") return badge("🔴 Cooldown", "#fee2e2", "#991b1b");
  if (health === "warning") return badge("🟡 Warning", "#fef3c7", "#92400e");
  if (health === "blocked") return badge("⚫ Blocked", "#e5e7eb", "#111827");
  if (health === "opt_out") return badge("⚫ Opt-out", "#e5e7eb", "#111827");
  return badge("🟢 Healthy", "#dcfce7", "#166534");
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data: customer, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !customer) {
    return (
      <main style={{ padding: 24 }}>
        <Link href="/customers">← Customers</Link>
        <h1>Customer not found</h1>
        <pre>{error?.message}</pre>
      </main>
    );
  }

  const { data: messages } = await supabase
    .from("message_logs")
    .select("*")
    .eq("phone", customer.phone)
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .eq("customer_phone", customer.phone)
    .order("created_at", { ascending: false });

  const revenue =
    orders?.reduce((sum: number, o: any) => sum + (o.amount_in_paise || 0), 0) || 0;

  return (
    <main style={{ padding: 24, background: "#fafafa", minHeight: "100vh" }}>
      <nav style={{ marginBottom: 24 }}>
        <Link href="/customers">← Customers</Link>{" | "}
        <Link href={`/inbox/${customer.phone}`}>Open Chat</Link>{" | "}
        <Link href="/orders">Orders</Link>
      </nav>

      <h1>{customer.name || "Unknown Customer"}</h1>
      <p style={{ color: "#666" }}>{customer.phone}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
        <Stat title="Health" value={healthBadge(customer)} />
        <Stat title="Orders" value={orders?.length || 0} />
        <Stat title="Revenue" value={formatINR(revenue)} />
        <Stat title="Replies" value={customer.total_replies || 0} />
      </div>

      <section style={card}>
        <h2>Customer Info</h2>
        <Info label="Product" value={customer.product || "-"} />
        <Info label="City" value={customer.city || "-"} />
        <Info label="Source" value={customer.source || "-"} />
        <Info label="Last Campaign" value={customer.last_campaign_name || "-"} />
        <Info label="Last Campaign At" value={customer.last_campaign_at ? new Date(customer.last_campaign_at).toLocaleString() : "-"} />
        <Info label="Fail Count" value={customer.marketing_fail_count || 0} />
        <Info label="Last Fail Reason" value={customer.last_marketing_fail_reason || "-"} />
        <Info label="Cooldown Until" value={customer.marketing_cooldown_until ? new Date(customer.marketing_cooldown_until).toLocaleString() : "-"} />
      </section>

      <section style={{ ...card, marginTop: 16 }}>
        <h2>Orders</h2>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Order</th>
              <th style={th}>Amount</th>
              <th style={th}>Payment</th>
              <th style={th}>Shipping</th>
              <th style={th}>Date</th>
              <th style={th}>View</th>
            </tr>
          </thead>
          <tbody>
            {(orders || []).map((o: any) => (
              <tr key={o.id}>
                <td style={td}>{o.order_number}</td>
                <td style={td}>{formatINR(o.amount_in_paise)}</td>
                <td style={td}>{o.payment_status}</td>
                <td style={td}>{o.shipping_status}</td>
                <td style={td}>{new Date(o.created_at).toLocaleString()}</td>
                <td style={td}><Link href={`/orders/${o.id}`}>View</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ ...card, marginTop: 16 }}>
        <h2>Recent Messages</h2>
        {(messages || []).map((m: any) => (
          <div key={m.id} style={{ borderBottom: "1px solid #eee", padding: "10px 0" }}>
            <b>{m.direction === "inbound" ? "Customer" : "You"}:</b>{" "}
            {m.body || m.template_name || "[message]"}
            <div style={{ color: "#777", fontSize: 12, marginTop: 4 }}>
              {new Date(m.created_at).toLocaleString()} • {m.status}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

function Stat({ title, value }: { title: string; value: any }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 13, color: "#777" }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <p>
      <b>{label}:</b> {value}
    </p>
  );
}

const card = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 16,
};

const table = {
  width: "100%",
  borderCollapse: "collapse" as const,
};

const th = {
  textAlign: "left" as const,
  padding: 10,
  borderBottom: "1px solid #ddd",
};

const td = {
  padding: 10,
  borderBottom: "1px solid #eee",
};
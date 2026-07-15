import Link from "next/link";
import { supabaseAdmin } from "../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function formatINR(paise: number) {
  return `₹${((paise || 0) / 100).toFixed(0)}`;
}

export default async function Home() {
  const supabase = supabaseAdmin();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: customers } = await supabase.from("customers").select("*");

  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  const { data: messages } = await supabase
    .from("message_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const todayOrders =
    orders?.filter((o: any) => new Date(o.created_at) >= today) || [];

  const todayRevenue = todayOrders.reduce(
    (sum: number, o: any) =>
      o.payment_status === "paid" ? sum + (o.amount_in_paise || 0) : sum,
    0
  );

  const totalRevenue =
    orders?.reduce(
      (sum: number, o: any) =>
        o.payment_status === "paid" ? sum + (o.amount_in_paise || 0) : sum,
      0
    ) || 0;

  const healthy =
    customers?.filter((c: any) => c.marketing_health === "healthy").length || 0;

  const warning =
    customers?.filter((c: any) => c.marketing_health === "warning").length || 0;

  const cooldown =
    customers?.filter((c: any) => c.marketing_health === "cooldown").length || 0;

  const pendingOrders =
    orders?.filter((o: any) =>
      ["pending", "packed"].includes(o.shipping_status)
    ).length || 0;

  const latestReplies =
    messages?.filter((m: any) => m.direction === "inbound").slice(0, 5) || [];

  const failedMessages =
    messages?.filter((m: any) => m.status === "failed").length || 0;

  return (
    <main style={{ padding: 24, background: "#fafafa", minHeight: "100vh" }}>
      <nav style={{ marginBottom: 24 }}>
        <Link href="/orders">Orders</Link>{" | "}
        <Link href="/customers">Customers</Link>{" | "}
        <Link href="/campaigns">Campaigns</Link>{" | "}
        <Link href="/campaign-history">Campaign History</Link>{" | "}
        <Link href="/inbox">Inbox</Link>{" | "}
        <Link href="/messages">Messages</Link>
      </nav>

      <h1>HOUSE OF EON CRM</h1>

      <p style={{ color: "#666" }}>
        Business dashboard for campaigns, replies, customers, and orders.
      </p>

      <h2>Business Overview</h2>

      <div style={grid4}>
        <Stat title="Customers" value={customers?.length || 0} />
        <Stat title="Orders Today" value={todayOrders.length} />
        <Stat title="Revenue Today" value={formatINR(todayRevenue)} />
        <Stat title="Total Revenue" value={formatINR(totalRevenue)} />
      </div>

      <h2 style={{ marginTop: 30 }}>Customer Health</h2>

      <div style={grid4}>
        <Stat title="Healthy" value={healthy} />
        <Stat title="Warning" value={warning} />
        <Stat title="Cooldown" value={cooldown} />
        <Stat title="Pending Orders" value={pendingOrders} />
      </div>

      <h2 style={{ marginTop: 30 }}>Marketing</h2>

      <div style={grid4}>
        <Stat title="Recent Campaigns" value={campaigns?.length || 0} />
        <Stat title="Recent Messages" value={messages?.length || 0} />
        <Stat title="Latest Replies" value={latestReplies.length} />
        <Stat title="Failed Messages" value={failedMessages} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          marginTop: 30,
        }}
      >
        <section style={card}>
          <h2>Recent Orders</h2>

          {(orders || []).slice(0, 6).map((o: any) => (
            <div key={o.id} style={row}>
              <div>
                <b>{o.order_number}</b>
                <div style={muted}>
                  {o.customer_name} • {o.customer_phone}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <b>{formatINR(o.amount_in_paise)}</b>
                <div style={muted}>{o.shipping_status}</div>
              </div>
            </div>
          ))}

          <p>
            <Link href="/orders">View all orders →</Link>
          </p>
        </section>

        <section style={card}>
          <h2>Latest Replies</h2>

          {latestReplies.length === 0 && <p style={muted}>No recent replies.</p>}

          {latestReplies.map((m: any) => (
            <div key={m.id} style={row}>
              <div>
                <b>{m.phone}</b>
                <div style={muted}>{m.body || "[message]"}</div>
              </div>

              <Link href={`/inbox/${m.phone}`}>Open</Link>
            </div>
          ))}

          <p>
            <Link href="/inbox">Open inbox →</Link>
          </p>
        </section>
      </div>

      <section style={{ ...card, marginTop: 30 }}>
        <h2>Recent Campaigns</h2>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Campaign</th>
              <th style={th}>Template</th>
              <th style={th}>Audience</th>
              <th style={th}>Sent</th>
              <th style={th}>Failed</th>
              <th style={th}>Status</th>
              <th style={th}>View</th>
            </tr>
          </thead>

          <tbody>
            {(campaigns || []).map((c: any) => (
              <tr key={c.id}>
                <td style={td}>{c.name}</td>
                <td style={td}>{c.template_name}</td>
                <td style={td}>{c.total_recipients || 0}</td>
                <td style={td}>{c.sent_count || 0}</td>
                <td style={td}>{c.failed_count || 0}</td>
                <td style={td}>{c.status}</td>
                <td style={td}>
                  <Link href={`/campaign-history/${c.id}`}>View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function Stat({ title, value }: { title: string; value: any }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 13, color: "#777" }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>
        {value}
      </div>
    </div>
  );
}

const grid4 = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 16,
};

const card = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 16,
};

const row = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  borderBottom: "1px solid #eee",
  padding: "12px 0",
};

const muted = {
  color: "#777",
  fontSize: 13,
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
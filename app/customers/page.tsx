import Link from "next/link";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function badge(text: string, bg: string, color: string) {
  return (
    <span style={{ background: bg, color, padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
      {text}
    </span>
  );
}

function healthBadge(c: any) {
  if (c.marketing_health === "cooldown") return badge("🔴 Cooldown", "#fee2e2", "#991b1b");
  if (c.marketing_health === "warning") return badge("🟡 Warning", "#fef3c7", "#92400e");
  return badge("🟢 Healthy", "#dcfce7", "#166534");
}

export default async function Customers() {
  const supabase = supabaseAdmin();

  const { data: customers, error } = await supabase
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    return <main style={{ padding: 20 }}><pre>{error.message}</pre></main>;
  }

  return (
    <main style={{ padding: 20 }}>
      <div className="nav" style={{ marginBottom: 20 }}>
        <a href="/">Home</a>{" | "}
        <a href="/campaigns">Campaigns</a>{" | "}
        <a href="/campaign-history">Campaign History</a>{" | "}
        <a href="/inbox">Inbox</a>{" | "}
        <a href="/orders">Orders</a>
      </div>

      <h1>Customers CRM</h1>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 20, marginBottom: 30 }}>
        <h2>Import Customers</h2>
        <p>CSV Headers: <b>name, phone, product, city</b></p>

        <form action="/api/customers/import" method="POST" encType="multipart/form-data">
          <input type="password" name="admin_password" placeholder="Admin Password" required style={{ width: 300, padding: 10, marginBottom: 15 }} />
          <br />
          <input type="file" name="file" accept=".csv" required style={{ marginBottom: 15 }} />
          <br />
          <button style={{ padding: "10px 20px" }}>Import CSV</button>
        </form>
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#f5f5f5" }}>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Phone</th>
              <th style={th}>Health</th>
              <th style={th}>Product</th>
              <th style={th}>City</th>
              <th style={th}>Replies</th>
              <th style={th}>Orders</th>
              <th style={th}>Last Campaign</th>
              <th style={th}>Last Message</th>
              <th style={th}>View</th>
            </tr>
          </thead>

          <tbody>
            {(customers || []).map((c: any) => (
              <tr key={c.id}>
                <td style={td}><b>{c.name}</b></td>
                <td style={td}>{c.phone}</td>
                <td style={td}>{healthBadge(c)}</td>
                <td style={td}>{c.product || "-"}</td>
                <td style={td}>{c.city || "-"}</td>
                <td style={td}>{c.total_replies || 0}</td>
                <td style={td}>{c.total_orders || 0}</td>
                <td style={td}>{c.last_campaign_name || "-"}</td>
                <td style={td}>
                  {c.last_message_at ? new Date(c.last_message_at).toLocaleDateString() : "-"}
                </td>
                <td style={td}>
                  <Link href={`/customers/${c.id}`}>View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

const th = {
  textAlign: "left" as const,
  padding: 12,
  borderBottom: "1px solid #ddd",
};

const td = {
  padding: 12,
  borderBottom: "1px solid #eee",
};
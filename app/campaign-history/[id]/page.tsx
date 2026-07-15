import Link from "next/link";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function badge(text: string, bg: string, color: string) {
  return (
    <span
      style={{
        background: bg,
        color,
        padding: "5px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {text}
    </span>
  );
}

function statusBadge(status?: string) {
  const colors: any = {
    accepted: ["#e5e7eb", "#374151"],
    sent: ["#dbeafe", "#1d4ed8"],
    delivered: ["#dcfce7", "#166534"],
    read: ["#ecfdf5", "#047857"],
    failed: ["#fee2e2", "#991b1b"],
  };

  const [bg, color] = colors[status || ""] || ["#f3f4f6", "#374151"];
  return badge(status || "not_sent", bg, color);
}

function healthBadge(customer: any) {
  const health = customer?.marketing_health;
  const failCount = customer?.marketing_fail_count || 0;
  const cooldown = customer?.marketing_cooldown_until;

  const inCooldown =
    cooldown && new Date(cooldown).getTime() > Date.now();

  if (health === "blocked") return badge("⚫ Blocked", "#e5e7eb", "#111827");
  if (health === "opt_out") return badge("⚫ Opt-out", "#e5e7eb", "#111827");

  if (inCooldown || health === "cooldown") {
    return badge("🔴 Cooldown", "#fee2e2", "#991b1b");
  }

  if (health === "warning" || failCount >= 1) {
    return badge("🟡 Warning", "#fef3c7", "#92400e");
  }

  return badge("🟢 Healthy", "#dcfce7", "#166534");
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { data: recipients } = await supabase
    .from("campaign_recipients")
    .select(`
      *,
      customers (
        id,
        name,
        phone,
        product,
        city,
        marketing_health,
        marketing_fail_count,
        last_marketing_fail_reason,
        last_marketing_fail_at,
        marketing_cooldown_until,
        total_replies,
        total_orders,
        lifetime_value_in_paise
      )
    `)
    .eq("campaign_id", id)
    .order("created_at", { ascending: true });

  const { data: logs } = await supabase
    .from("message_logs")
    .select("*")
    .eq("campaign_id", id);

  const rows = recipients || [];
  const logMap = new Map((logs || []).map((l: any) => [l.phone, l]));
  console.log("rows", rows)

  const sent =
    logs?.filter((x: any) =>
      ["accepted", "sent", "delivered", "read"].includes(x.status)
    ).length || 0;

  const delivered =
    logs?.filter((x: any) => x.status === "delivered").length || 0;

  const read = logs?.filter((x: any) => x.status === "read").length || 0;
  const failed = logs?.filter((x: any) => x.status === "failed").length || 0;

  const phones = [...new Set((logs || []).map((x: any) => x.phone))];

  const { data: replies } = await supabase
    .from("message_logs")
    .select("*")
    .eq("direction", "inbound")
    .in("phone", phones.length ? phones : ["none"])
    .gte("created_at", campaign?.created_at || new Date().toISOString());

  return (
    <main style={{ padding: 24, background: "#fafafa", minHeight: "100vh" }}>
      <nav style={{ marginBottom: 24 }}>
        <Link href="/campaign-history">← Campaign History</Link>{" | "}
        <Link href="/campaigns">Send Campaign</Link>{" | "}
        <Link href="/inbox">Inbox</Link>
      </nav>

      <h1>{campaign?.name || "Campaign"}</h1>

      <p style={{ color: "#666" }}>
        Template: <b>{campaign?.template_name}</b> | Status:{" "}
        <b>{campaign?.status}</b> | Coupon:{" "}
        <b>{campaign?.coupon_code || "-"}</b>
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 16,
          margin: "20px 0",
        }}
      >
        <Stat title="Audience" value={rows.length} />
        <Stat title="Sent" value={sent} />
        <Stat title="Delivered" value={delivered} />
        <Stat title="Read" value={read} />
        <Stat title="Failed" value={failed} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <Stat title="Replies After Campaign" value={replies?.length || 0} />
      </div>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          background: "#fff",
          border: "1px solid #e5e7eb",
        }}
      >
        <thead style={{ background: "#f9fafb" }}>
          <tr>
            <th style={th}>Name</th>
            <th style={th}>Phone</th>
            <th style={th}>Product</th>
            <th style={th}>Message Status</th>
            <th style={th}>Customer Health</th>
            <th style={th}>Fails</th>
            <th style={th}>Reason</th>
            <th style={th}>Replies</th>
            <th style={th}>Orders</th>
            <th style={th}>Chat</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((r: any) => {
            const customer = Array.isArray(r.customers)
              ? r.customers[0]
              : r.customers;

            const log = logMap.get(r.phone);

            return (
              <tr key={r.id}>
                <td style={td}>{r.name || customer?.name || "Unknown"}</td>
                <td style={td}>{r.phone}</td>
                <td style={td}>{r.product || customer?.product || "-"}</td>
                <td style={td}>{statusBadge(log?.status || r.status)}</td>
                <td style={td}>{healthBadge(customer)}</td>
                <td style={td}>{customer?.marketing_fail_count || 0}</td>
                <td style={td}>
                  {log?.error ||
                    customer?.last_marketing_fail_reason ||
                    r.reason ||
                    "-"}
                </td>
                <td style={td}>{customer?.total_replies || 0}</td>
                <td style={td}>{customer?.total_orders || 0}</td>
                <td style={td}>
                  <Link href={`/inbox/${r.phone}`}>Open</Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
        padding: 16,
      }}
    >
      <div style={{ fontSize: 13, color: "#777" }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

const th = {
  textAlign: "left" as const,
  padding: 10,
  borderBottom: "1px solid #e5e7eb",
  fontSize: 13,
};

const td = {
  padding: 10,
  borderBottom: "1px solid #eee",
  fontSize: 14,
  verticalAlign: "top" as const,
};
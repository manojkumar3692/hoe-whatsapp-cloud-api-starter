import Link from "next/link";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function healthBadge(customer: any) {
  const failCount = customer?.marketing_fail_count || 0;
  const cooldown = customer?.marketing_cooldown_until;

  const inCooldown =
    cooldown && new Date(cooldown).getTime() > Date.now();

  if (inCooldown) {
    return badge("🔴 Cooldown", "#fee2e2", "#991b1b");
  }

  if (failCount >= 2) {
    return badge("🟡 Warning", "#fef3c7", "#92400e");
  }

  return badge("🟢 Healthy", "#dcfce7", "#166534");
}

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

function messageBadge(status: string) {
  const colors: any = {
    accepted: ["#e5e7eb", "#374151"],
    sent: ["#dbeafe", "#1d4ed8"],
    delivered: ["#dcfce7", "#166534"],
    read: ["#ecfdf5", "#047857"],
    failed: ["#fee2e2", "#991b1b"],
  };

  const [bg, color] = colors[status] || ["#f3f4f6", "#374151"];
  return badge(status, bg, color);
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
        marketing_fail_count,
        last_marketing_fail_reason,
        last_marketing_fail_at,
        marketing_cooldown_until
      )
    `)
    .eq("campaign_id", id)
    .order("created_at", { ascending: true });

  const { data: logs } = await supabase
    .from("message_logs")
    .select("*")
    .eq("campaign_id", id);

  const logMap = new Map((logs || []).map((l: any) => [l.phone, l]));

  const rows = recipients || [];

  const sent = logs?.filter((x: any) =>
    ["accepted", "sent", "delivered", "read"].includes(x.status)
  ).length || 0;

  const delivered = logs?.filter((x: any) => x.status === "delivered").length || 0;
  const read = logs?.filter((x: any) => x.status === "read").length || 0;
  const failed = logs?.filter((x: any) => x.status === "failed").length || 0;

  return (
    <main style={{ padding: 24, background: "#fafafa", minHeight: "100vh" }}>
      <nav style={{ marginBottom: 24 }}>
        <Link href="/campaign-history">← Campaign History</Link>{" | "}
        <Link href="/campaigns">Send Campaign</Link>{" | "}
        <Link href="/inbox">Inbox</Link>
      </nav>

      <h1>{campaign?.name || "Campaign"}</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <Stat title="Audience" value={campaign?.total_recipients || rows.length} />
        <Stat title="Sent" value={sent} />
        <Stat title="Delivered" value={delivered} />
        <Stat title="Failed" value={failed} />
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <p><b>Template:</b> {campaign?.template_name}</p>
        <p><b>Status:</b> {campaign?.status}</p>
        <p><b>Coupon:</b> {campaign?.coupon_code || "-"}</p>
        <p><b>Created:</b> {campaign?.created_at ? new Date(campaign.created_at).toLocaleString() : "-"}</p>
      </div>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          background: "#fff",
          border: "1px solid #e5e7eb",
        }}
      >
        <thead>
          <tr>
            <th style={th}>Name</th>
            <th style={th}>Phone</th>
            <th style={th}>Product</th>
            <th style={th}>City</th>
            <th style={th}>Message</th>
            <th style={th}>Health</th>
            <th style={th}>Fail Reason</th>
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
                <td style={td}>{r.name}</td>
                <td style={td}>{r.phone}</td>
                <td style={td}>{r.product || customer?.product || "-"}</td>
                <td style={td}>{r.city || customer?.city || "-"}</td>
                <td style={td}>
                  {log ? messageBadge(log.status) : badge(r.status, "#f3f4f6", "#374151")}
                </td>
                <td style={td}>{healthBadge(customer)}</td>
                <td style={td}>
                  {customer?.last_marketing_fail_reason || log?.error || r.reason || "-"}
                </td>
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
  borderBottom: "1px solid #ddd",
};

const td = {
  padding: 10,
  borderBottom: "1px solid #eee",
  verticalAlign: "top" as const,
};
import Link from "next/link";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function formatINR(paise: number) {
  return `₹${((paise || 0) / 100).toFixed(0)}`;
}

function badge(status: string) {
  const colors: any = {
    draft: ["#fef3c7", "#92400e"],
    sending: ["#dbeafe", "#1d4ed8"],
    completed: ["#dcfce7", "#166534"],
    failed: ["#fee2e2", "#991b1b"],
  };

  const [bg, color] = colors[status] || ["#f3f4f6", "#374151"];

  return (
    <span
      style={{
        background: bg,
        color,
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {status}
    </span>
  );
}

export default async function CampaignHistory() {
  const supabase = supabaseAdmin();

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  const rows = [];

  for (const campaign of campaigns || []) {
    const { data: logs } = await supabase
      .from("message_logs")
      .select("*")
      .eq("campaign_id", campaign.id);

    const sent = logs?.filter((x) =>
      ["accepted", "sent", "delivered", "read"].includes(x.status)
    ).length || 0;

    const accepted = logs?.filter((x) => x.status === "accepted").length || 0;
    const delivered = logs?.filter((x) => x.status === "delivered").length || 0;
    const read = logs?.filter((x) => x.status === "read").length || 0;
    const failed = logs?.filter((x) => x.status === "failed").length || 0;

    const phones = [...new Set((logs || []).map((x) => x.phone))];

    const { data: replies } = await supabase
      .from("message_logs")
      .select("*")
      .eq("direction", "inbound")
      .in("phone", phones.length ? phones : ["none"])
      .gte("created_at", campaign.created_at);

    let ordersCount = 0;
    let revenue = 0;

    if (campaign.coupon_code) {
      const { data: orders } = await supabase
        .from("orders")
        .select("*")
        .eq("coupon_code", campaign.coupon_code)
        .eq("payment_status", "paid")
        .gte("created_at", campaign.created_at);

      ordersCount = orders?.length || 0;
      revenue =
        orders?.reduce(
          (sum: number, order: any) => sum + (order.amount_in_paise || 0),
          0
        ) || 0;
    }

    const deliveryRate = sent > 0 ? Math.round((delivered / sent) * 100) : 0;
    const readRate = sent > 0 ? Math.round((read / sent) * 100) : 0;
    const replyRate = sent > 0 ? Math.round(((replies?.length || 0) / sent) * 100) : 0;

    rows.push({
      campaign,
      sent,
      accepted,
      delivered,
      read,
      failed,
      replies: replies?.length || 0,
      ordersCount,
      revenue,
      deliveryRate,
      readRate,
      replyRate,
    });
  }

  return (
    <main style={{ padding: 24, background: "#fafafa", minHeight: "100vh" }}>
      <nav style={{ marginBottom: 24 }}>
        <Link href="/">Home</Link>{" | "}
        <Link href="/campaigns">Send Campaign</Link>{" | "}
        <Link href="/inbox">Inbox</Link>{" | "}
        <Link href="/orders">Orders</Link>
      </nav>

      <h1>Campaign History</h1>

      <p style={{ color: "#666" }}>
        Revenue is calculated from paid orders using the same coupon code after
        the campaign was created.
      </p>

      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          overflow: "hidden",
          marginTop: 20,
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#f9fafb" }}>
            <tr>
              <th style={th}>Campaign</th>
              <th style={th}>Status</th>
              <th style={th}>Template</th>
              <th style={th}>Audience</th>
              <th style={th}>Sent</th>
              <th style={th}>Delivered</th>
              <th style={th}>Read</th>
              <th style={th}>Failed</th>
              <th style={th}>Replies</th>
              <th style={th}>Orders</th>
              <th style={th}>Revenue</th>
              <th style={th}>Date</th>
              <th style={th}>Date</th>
              
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.campaign.id}>
                <td style={td}>
                  <b>{row.campaign.name}</b>
                  {row.campaign.status === "draft" && (
                    <div style={{ color: "#92400e", fontSize: 12 }}>
                      Preview only — not sent yet
                    </div>
                  )}
                </td>
                <td style={td}>{badge(row.campaign.status)}</td>
                <td style={td}>{row.campaign.template_name}</td>
                <td style={td}>{row.campaign.total_recipients}</td>
                <td style={td}>{row.sent}</td>
                <td style={td}>
                  {row.delivered}
                  <div style={small}>{row.deliveryRate}%</div>
                </td>
                <td style={td}>
                  {row.read}
                  <div style={small}>{row.readRate}%</div>
                </td>
                <td style={td}>{row.failed}</td>
                <td style={td}>
                  {row.replies}
                  <div style={small}>{row.replyRate}%</div>
                </td>
                <td style={td}>{row.ordersCount}</td>
                <td style={td}>
                  <b>{formatINR(row.revenue)}</b>
                </td>
                <td style={td}>
                  {new Date(row.campaign.created_at).toLocaleString()}
                </td>
                <td style={td}>
  <Link href={`/campaign-history/${row.campaign.id}`}>View</Link>
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
  borderBottom: "1px solid #e5e7eb",
  fontSize: 13,
  color: "#555",
};

const td = {
  padding: 12,
  borderBottom: "1px solid #f1f1f1",
  fontSize: 14,
  verticalAlign: "top" as const,
};

const small = {
  fontSize: 11,
  color: "#777",
  marginTop: 4,
};
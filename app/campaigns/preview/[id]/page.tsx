import Link from "next/link";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function statusBadge(status: string) {
  const styles: any = {
    ready: ["#dcfce7", "#166534", "🟢 Ready"],
    warning: ["#fef3c7", "#92400e", "🟡 Warning"],
    cooldown: ["#fee2e2", "#991b1b", "🔴 Cooldown"],
    already_sent: ["#e5e7eb", "#374151", "⚪ Already Sent"],
    sent: ["#dbeafe", "#1d4ed8", "✅ Sent"],
    failed: ["#fee2e2", "#991b1b", "❌ Failed"],
  };

  const [bg, color, label] = styles[status] || ["#f3f4f6", "#374151", status];

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
      {label}
    </span>
  );
}

export default async function CampaignPreviewPage({
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
    .select("*")
    .eq("campaign_id", id)
    .order("created_at", { ascending: true });

  const rows = recipients || [];

  const ready = rows.filter((r: any) => r.status === "ready").length;
  const warning = rows.filter((r: any) => r.status === "warning").length;
  const cooldown = rows.filter((r: any) => r.status === "cooldown").length;
  const alreadySent = rows.filter((r: any) => r.status === "already_sent").length;

  const normalSendCount = ready + warning;
  const overrideSendCount = rows.length - alreadySent;

  return (
    <main style={{ padding: 24, background: "#fafafa", minHeight: "100vh" }}>
      <nav style={{ marginBottom: 24 }}>
        <Link href="/campaigns">← Back to Campaigns</Link>
      </nav>

      <h1>Preview Campaign</h1>

      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 18,
          marginBottom: 20,
        }}
      >
        <h2>{campaign?.name}</h2>
        <p><b>Template:</b> {campaign?.template_name}</p>
        <p><b>Total Uploaded:</b> {rows.length}</p>
        <p><b>Ready:</b> {ready}</p>
        <p><b>Warning:</b> {warning}</p>
        <p><b>Cooldown:</b> {cooldown}</p>
        <p><b>Already Sent Before:</b> {alreadySent}</p>
      </div>

      <form
        action="/api/campaigns/send"
        method="POST"
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 18,
          marginBottom: 20,
        }}
      >
        <input type="hidden" name="campaign_id" value={id} />

        <input
          name="admin_password"
          type="password"
          placeholder="Admin password"
          required
          style={{ padding: 10, marginRight: 10 }}
        />

        <label style={{ display: "block", marginTop: 14, marginBottom: 14 }}>
          <input type="checkbox" name="send_everyone_anyway" value="yes" />{" "}
          Send to everyone anyway, including cooldown customers
        </label>

        <button
          type="submit"
          style={{
            padding: "10px 18px",
            background: "#111",
            color: "#fff",
            border: 0,
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Send Campaign
        </button>

        <p style={{ color: "#666", marginTop: 10 }}>
          Normal send: {normalSendCount}. With override: {overrideSendCount}.
          Already-sent customers are still skipped.
        </p>
      </form>

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
            <th style={th}>Health / Status</th>
            <th style={th}>Reason</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id}>
              <td style={td}>{r.name}</td>
              <td style={td}>{r.phone}</td>
              <td style={td}>{r.product || "-"}</td>
              <td style={td}>{r.city || "-"}</td>
              <td style={td}>{statusBadge(r.status)}</td>
              <td style={td}>{r.reason || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
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
};
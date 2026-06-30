import Link from "next/link";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

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
  const alreadySent = rows.filter((r: any) => r.status === "already_sent").length;

  return (
    <main style={{ padding: 24 }}>
      <nav style={{ marginBottom: 24 }}>
        <Link href="/campaigns">← Back to Campaigns</Link>
      </nav>

      <h1>Preview Campaign</h1>

      <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 16, marginBottom: 20 }}>
        <h2>{campaign?.name}</h2>
        <p><b>Template:</b> {campaign?.template_name}</p>
        <p><b>Total Uploaded:</b> {rows.length}</p>
        <p><b>Ready to Send:</b> {ready}</p>
        <p><b>Already Sent Before:</b> {alreadySent}</p>
      </div>

      <form action="/api/campaigns/send" method="POST" style={{ marginBottom: 20 }}>
        <input type="hidden" name="campaign_id" value={id} />

        <input
          name="admin_password"
          type="password"
          placeholder="Admin password"
          required
          style={{ padding: 10, marginRight: 10 }}
        />

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
          Send Only Ready Customers ({ready})
        </button>
      </form>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>Name</th>
            <th style={th}>Phone</th>
            <th style={th}>Product</th>
            <th style={th}>City</th>
            <th style={th}>Status</th>
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
              <td style={td}>
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: r.status === "ready" ? "#dcfce7" : "#fef3c7",
                    color: r.status === "ready" ? "#166534" : "#92400e",
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  {r.status}
                </span>
              </td>
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
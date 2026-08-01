import Link from "next/link";
import Header from "../components/Header";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function formatINR(paise: number) {
  return `₹${((paise || 0) / 100).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
}

function badge(text: string, bg: string, color: string) {
  return (
    <span
      style={{
        background: bg,
        color,
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function healthBadge(c: any) {
  if (c.marketing_health === "cooldown") return badge("🔴 Cooldown", "#fee2e2", "#991b1b");
  if (c.marketing_health === "warning") return badge("🟡 Warning", "#fef3c7", "#92400e");
  return badge("🟢 Healthy", "#dcfce7", "#166534");
}

const SOURCE_LABELS: Record<string, string> = {
  csv: "CSV Import",
  orders: "Orders",
  checkout_session: "Checkout Session",
  whatsapp: "WhatsApp Reply",
  campaign_csv: "Campaign",
  past_orders: "Past Orders",
};

const SOURCE_COLORS: Record<string, [string, string]> = {
  csv: ["#e0e7ff", "#3730a3"],
  orders: ["#dbeafe", "#1d4ed8"],
  checkout_session: ["#fce7f3", "#9d174d"],
  whatsapp: ["#dcfce7", "#166534"],
  campaign_csv: ["#e0f2fe", "#075985"],
  past_orders: ["#f3f4f6", "#374151"],
};

function sourceBadge(source: string) {
  const label = SOURCE_LABELS[source] || source || "Unknown";
  const [bg, color] = SOURCE_COLORS[source] || ["#f3f4f6", "#374151"];
  return badge(label, bg, color);
}

function tagChips(tags: string[]) {
  if (!tags || tags.length === 0) return "-";
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {tags.map((t) =>
        t === "abandoned_cart"
          ? <span key={t}>{badge("🛒 Abandoned Cart", "#ffedd5", "#9a3412")}</span>
          : <span key={t}>{badge(t, "#f3f4f6", "#374151")}</span>
      )}
    </div>
  );
}

const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#dc2626", "#d97706", "#059669", "#0891b2"];

function avatar(name: string) {
  const letter = (name || "?").trim().charAt(0).toUpperCase() || "?";
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];

  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: color,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {letter}
    </div>
  );
}

function notice(bg: string, color: string) {
  return {
    background: bg,
    color,
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
    fontSize: 14,
  };
}

function Stat({
  title,
  value,
  accent,
}: {
  title: string;
  value: any;
  accent: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 18,
        borderLeft: `4px solid ${accent}`,
      }}
    >
      <div style={{ color: "#777", fontSize: 13 }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{value}</div>
    </div>
  );
}

export default async function Customers({
  searchParams,
}: {
  searchParams: Promise<{
    imported?: string;
    duplicates?: string;
    synced?: string;
    updated?: string;
    sessions_added?: string;
    q?: string;
    health?: string;
    source?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = supabaseAdmin();

  const [{ count: totalCount }, { data: statsRows }] = await Promise.all([
    supabase.from("customers").select("*", { count: "exact", head: true }),
    supabase
      .from("customers")
      .select(
        "marketing_health, opt_out, blocked, source, lifetime_value_in_paise, total_orders, created_at"
      )
      .limit(20000),
  ]);

  let listQuery = supabase
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  if (params.health) listQuery = listQuery.eq("marketing_health", params.health);
  if (params.source) listQuery = listQuery.eq("source", params.source);

  const { data: rawCustomers, error } = await listQuery;

  let customers = rawCustomers || [];

  if (params.q) {
    const q = params.q.toLowerCase();
    customers = customers.filter((c: any) =>
      [c.name, c.phone, c.city, c.product, c.email]
        .filter(Boolean)
        .some((v: any) => String(v).toLowerCase().includes(q))
    );
  }

  if (error) {
    return <main style={{ padding: 20 }}><pre>{error.message}</pre></main>;
  }

  const rows = statsRows || [];
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const healthyCount = rows.filter((c: any) => (c.marketing_health || "healthy") === "healthy").length;
  const warningCount = rows.filter((c: any) => c.marketing_health === "warning").length;
  const cooldownCount = rows.filter((c: any) => c.marketing_health === "cooldown").length;
  const atRiskCount = warningCount + cooldownCount;
  const optedOutCount = rows.filter((c: any) => c.opt_out || c.blocked).length;
  const newThisWeek = rows.filter((c: any) => new Date(c.created_at) >= sevenDaysAgo).length;
  const lifetimeValueSum = rows.reduce((sum: number, c: any) => sum + (c.lifetime_value_in_paise || 0), 0);

  const sources = [...new Set(rows.map((c: any) => c.source).filter(Boolean))] as string[];

  const hasFilters = !!(params.q || params.health || params.source);

  return (
    <main style={{ padding: 24, background: "#fafafa", minHeight: "100vh" }}>
      <Header active="customers" />

      <h1 style={{ marginBottom: 4 }}>Customers CRM</h1>
      <p style={{ color: "#666", marginBottom: 20 }}>
        Everyone you can message on WhatsApp — imported, ordered, or captured at checkout.
      </p>

      {params.imported && (
        <div style={notice("#dcfce7", "#166534")}>
          Imported {params.imported} customers
          {params.duplicates && Number(params.duplicates) > 0
            ? ` (${params.duplicates} duplicate rows in the CSV were merged)`
            : ""}
          .
        </div>
      )}

      {(params.synced || params.updated || params.sessions_added) && (
        <div style={notice("#dbeafe", "#1d4ed8")}>
          Sync complete: {params.synced || 0} new customer(s) from orders,{" "}
          {params.sessions_added || 0} new customer(s) from checkout
          sessions, {params.updated || 0} existing customer(s) had their
          order stats refreshed.
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <Stat title="Total Customers" value={totalCount ?? rows.length} accent="#2563eb" />
        <Stat title="New This Week" value={newThisWeek} accent="#059669" />
        <Stat title="Healthy" value={healthyCount} accent="#16a34a" />
        <Stat title="At Risk" value={atRiskCount} accent="#d97706" />
        <Stat title="Opted Out / Blocked" value={optedOutCount} accent="#991b1b" />
        <Stat title="Lifetime Value" value={formatINR(lifetimeValueSum)} accent="#7c3aed" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 20 }}>
          <h2 style={{ marginTop: 0 }}>Import Customers</h2>
          <p style={{ color: "#666", fontSize: 14 }}>CSV Headers: <b>name, phone, product, city</b></p>

          <form action="/api/customers/import" method="POST" encType="multipart/form-data">
            <input type="password" name="admin_password" placeholder="Admin Password" required style={input} />
            <input type="file" name="file" accept=".csv" required style={{ marginBottom: 15 }} />
            <br />
            <button style={primaryButton}>Import CSV</button>
          </form>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 20 }}>
          <h2 style={{ marginTop: 0 }}>Sync from Orders &amp; Checkout Sessions</h2>
          <p style={{ color: "#666", fontSize: 14 }}>
            Adds anyone who placed an order or started a checkout but
            isn&apos;t in the CRM yet, and refreshes order count / lifetime
            value / last order date for existing order customers. Existing
            customers are never overwritten. Abandoned checkouts that never
            paid are tagged <code>abandoned_cart</code>.
          </p>

          <form action="/api/customers/sync-orders" method="POST">
            <input type="password" name="admin_password" placeholder="Admin Password" required style={input} />
            <button style={primaryButton}>Sync Now</button>
          </form>
        </div>
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
          gridTemplateColumns: "2fr 1fr 1fr auto auto",
          gap: 12,
          alignItems: "end",
        }}
      >
        <div>
          <label style={label}>Search</label>
          <input name="q" defaultValue={params.q || ""} placeholder="Name, phone, city..." style={input} />
        </div>

        <div>
          <label style={label}>Health</label>
          <select name="health" defaultValue={params.health || ""} style={input}>
            <option value="">All</option>
            <option value="healthy">Healthy</option>
            <option value="warning">Warning</option>
            <option value="cooldown">Cooldown</option>
          </select>
        </div>

        <div>
          <label style={label}>Source</label>
          <select name="source" defaultValue={params.source || ""} style={input}>
            <option value="">All</option>
            {sources.map((s) => (
              <option key={s} value={s}>{SOURCE_LABELS[s] || s}</option>
            ))}
          </select>
        </div>

        <button type="submit" style={primaryButton}>Filter</button>

        {hasFilters && (
          <a href="/customers" style={{ ...secondaryButton, textAlign: "center" as const }}>
            Clear
          </a>
        )}
      </form>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead style={{ background: "#f9fafb" }}>
              <tr>
                <th style={th}>Customer</th>
                <th style={th}>Health</th>
                <th style={th}>Source</th>
                <th style={th}>Product / City</th>
                <th style={th}>Orders</th>
                <th style={th}>Value</th>
                <th style={th}>Tags</th>
                <th style={th}>Last Message</th>
                <th style={th}>View</th>
              </tr>
            </thead>

            <tbody>
              {customers.map((c: any) => (
                <tr key={c.id}>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {avatar(c.name)}
                      <div>
                        <div style={{ fontWeight: 700 }}>{c.name}</div>
                        <div style={{ color: "#888", fontSize: 12 }}>{c.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td style={td}>{healthBadge(c)}</td>
                  <td style={td}>{sourceBadge(c.source)}</td>
                  <td style={td}>
                    <div>{c.product || "-"}</div>
                    <div style={{ color: "#888", fontSize: 12 }}>{c.city || ""}</div>
                  </td>
                  <td style={td}>{c.total_orders || 0}</td>
                  <td style={td}><b>{formatINR(c.lifetime_value_in_paise)}</b></td>
                  <td style={td}>{tagChips(c.tags)}</td>
                  <td style={td}>
                    {c.last_message_at ? new Date(c.last_message_at).toLocaleDateString() : "-"}
                  </td>
                  <td style={td}>
                    <Link href={`/customers/${c.id}`}>View</Link>
                  </td>
                </tr>
              ))}

              {customers.length === 0 && (
                <tr>
                  <td style={td} colSpan={9}>No customers match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalCount && totalCount > 300 && (
        <p style={{ color: "#999", fontSize: 13, marginTop: 12 }}>
          Showing latest 300 of {totalCount} customers. Use search/filters to narrow it down.
        </p>
      )}
    </main>
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
  boxSizing: "border-box" as const,
  marginBottom: 15,
};

const primaryButton = {
  padding: "10px 20px",
  borderRadius: 8,
  border: 0,
  background: "#111",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButton = {
  padding: "10px 20px",
  borderRadius: 8,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#111",
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
};

const th = {
  textAlign: "left" as const,
  padding: 12,
  borderBottom: "1px solid #e5e7eb",
  fontSize: 13,
  color: "#555",
  whiteSpace: "nowrap" as const,
};

const td = {
  padding: 12,
  borderBottom: "1px solid #f1f1f1",
  fontSize: 14,
};

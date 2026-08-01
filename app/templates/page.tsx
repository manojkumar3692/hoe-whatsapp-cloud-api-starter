import Link from "next/link";
import Header from "../components/Header";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function statusBadge(status: string) {
  const colors: Record<string, [string, string]> = {
    APPROVED: ["#dcfce7", "#166534"],
    PENDING: ["#fef9c3", "#854d0e"],
    REJECTED: ["#fee2e2", "#991b1b"],
    PAUSED: ["#e0e7ff", "#3730a3"],
    DISABLED: ["#f3f4f6", "#374151"],
    IN_APPEAL: ["#fce7f3", "#9d174d"],
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
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; synced?: string }>;
}) {
  const params = await searchParams;
  const supabase = supabaseAdmin();

  const { data: templates, error } = await supabase
    .from("whatsapp_templates")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <main style={{ padding: 24, background: "#fafafa", minHeight: "100vh" }}>
      <Header active="templates" />

      <h1 style={{ marginBottom: 8 }}>WhatsApp Templates</h1>
      <p style={{ color: "#666", marginBottom: 20 }}>
        Submits templates straight to Meta for review. Meta still has to
        approve them — this just skips Business Manager.
      </p>

      {params.created && (
        <div style={notice("#dcfce7", "#166534")}>
          Submitted <b>{params.created}</b> for review. Status starts as
          PENDING until Meta reviews it — usually within minutes to a few
          hours.
        </div>
      )}

      {params.synced && (
        <div style={notice("#dbeafe", "#1d4ed8")}>
          Statuses refreshed from Meta.
        </div>
      )}

      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Create a new template</h2>

        <form
          action="/api/templates/create"
          method="post"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          <input
            name="admin_password"
            type="password"
            placeholder="Admin password"
            required
            style={{ ...input, gridColumn: "1 / -1" }}
          />

          <div>
            <label style={label}>Template name</label>
            <input
              name="name"
              defaultValue="abandoned_cart_recovery_v2"
              placeholder="e.g. desert_tonka_launch"
              required
              style={input}
            />
            <div style={hint}>
              Lowercase letters, numbers, underscores only — spaces get
              converted automatically.
            </div>
          </div>

          <div>
            <label style={label}>Category</label>
            <select name="category" defaultValue="MARKETING" style={input}>
              <option value="MARKETING">MARKETING</option>
              <option value="UTILITY">UTILITY</option>
              <option value="AUTHENTICATION">AUTHENTICATION</option>
            </select>
          </div>

          <div>
            <label style={label}>Language</label>
            <select name="language" defaultValue="en" style={input}>
              <option value="en">English (en)</option>
              <option value="en_US">English - US (en_US)</option>
              <option value="en_GB">English - UK (en_GB)</option>
              <option value="hi">Hindi (hi)</option>
              <option value="ta">Tamil (ta)</option>
              <option value="te">Telugu (te)</option>
              <option value="kn">Kannada (kn)</option>
            </select>
          </div>

          <div>
            <label style={label}>Header type</label>
            <select name="header_type" defaultValue="image" style={input}>
              <option value="none">No header</option>
              <option value="text">Text header</option>
              <option value="image">Image header</option>
            </select>
            <div style={hint}>
              Image header uploads the URL below to Meta once as the review
              example. Video/document headers aren&apos;t supported here yet.
            </div>
          </div>

          <div>
            <label style={label}>Header text (if text header)</label>
            <input
              name="header_text"
              defaultValue="Your Cart is Waiting 🛍️"
              placeholder="Optional short header"
              style={input}
            />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label style={label}>Header image URL (if image header)</label>
            <input
              name="header_image_url"
              defaultValue="https://fvctxehmnzprbqhrxukc.supabase.co/storage/v1/object/public/campaign-image/sgold-lifestyle-3.png"
              placeholder="https://.../banner.jpg"
              style={input}
            />
            <div style={hint}>
              ⚠️ Fill this in before submitting — a real, publicly reachable
              image URL (JPEG/PNG, under 5MB). Used once now as Meta&apos;s
              review example; sends later can use a different URL per
              message (e.g. per-product), this one is just the default.
            </div>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label style={label}>Body text</label>
            <textarea
              name="body_text"
              defaultValue={
                "Hi {{1}}, you left *{{2}}* in your cart at House of Eon! Complete your order now before it's gone."
              }
              placeholder={
                "Hi {{1}}, your order for {{2}} is confirmed!"
              }
              required
              rows={4}
              style={{ ...input, fontFamily: "inherit" }}
            />
            <div style={hint}>
              Use {"{{1}}"}, {"{{2}}"}... for variables. List example values
              for each below, comma-separated, in order.
            </div>
          </div>

          <div>
            <label style={label}>Body variable examples</label>
            <input
              name="body_examples"
              defaultValue="Manoj, Desert Tonka Eau de Parfum"
              placeholder="Manoj, RANK Perfume"
              style={input}
            />
          </div>

          <div>
            <label style={label}>Footer text (optional)</label>
            <input
              name="footer_text"
              defaultValue="House of Eon"
              placeholder="e.g. HOUSE OF EON"
              style={input}
            />
          </div>

          <div>
            <label style={label}>Button</label>
            <select name="button_type" defaultValue="url" style={input}>
              <option value="none">No button</option>
              <option value="url">Website URL</option>
              <option value="phone">Call phone number</option>
            </select>
          </div>

          <div>
            <label style={label}>Button text</label>
            <input
              name="button_text"
              defaultValue="Complete My Order"
              placeholder="e.g. Shop Now"
              style={input}
            />
          </div>

          <div>
            <label style={label}>Button URL (if URL button)</label>
            <input
              name="button_url"
              defaultValue="https://www.houseofeon.in/{{1}}"
              placeholder="https://yourdomain.com/{{1}}"
              style={input}
            />
            <div style={hint}>
              The sender fills {"{{1}}"} in with{" "}
              <code>products/&lt;slug&gt;</code> when it can identify the
              item (e.g. <code>products/silent-gold-unisex-perfume</code>),
              or an empty string to fall back to your homepage. Override the{" "}
              <code>products/</code> prefix with{" "}
              <code>STOREFRONT_PRODUCT_PATH_PREFIX</code> if your product
              URLs use a different path.
            </div>
          </div>

          <div>
            <label style={label}>Button phone (if phone button)</label>
            <input
              name="button_phone"
              placeholder="+919876543210"
              style={input}
            />
          </div>

          <button
            type="submit"
            style={{
              gridColumn: "1 / -1",
              padding: "12px 20px",
              borderRadius: 8,
              border: 0,
              background: "#111",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Submit to Meta for review
          </button>
        </form>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <h2 style={{ margin: 0 }}>Submitted templates</h2>

        <form action="/api/templates/sync" method="post" style={{ display: "flex", gap: 8 }}>
          <input
            name="admin_password"
            type="password"
            placeholder="Admin password"
            required
            style={{ ...input, width: 200 }}
          />
          <button
            type="submit"
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Refresh status from Meta
          </button>
        </form>
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#f9fafb" }}>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Category</th>
              <th style={th}>Language</th>
              <th style={th}>Status</th>
              <th style={th}>Rejection reason</th>
              <th style={th}>Created</th>
            </tr>
          </thead>

          <tbody>
            {(templates || []).map((t: any) => (
              <tr key={t.id}>
                <td style={td}>
                  <b>{t.name}</b>
                </td>
                <td style={td}>{t.category}</td>
                <td style={td}>{t.language}</td>
                <td style={td}>{statusBadge(t.status)}</td>
                <td style={td}>{t.rejected_reason || "-"}</td>
                <td style={td}>
                  {new Date(t.created_at).toLocaleString()}
                </td>
              </tr>
            ))}

            {(!templates || templates.length === 0) && (
              <tr>
                <td style={td} colSpan={6}>
                  No templates submitted yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {error && (
        <div style={notice("#fee2e2", "#991b1b")}>{error.message}</div>
      )}
    </main>
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

const label = {
  display: "block",
  fontSize: 12,
  color: "#666",
  marginBottom: 6,
};

const hint = {
  fontSize: 12,
  color: "#999",
  marginTop: 4,
};

const input = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "1px solid #ddd",
  boxSizing: "border-box" as const,
};

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
};

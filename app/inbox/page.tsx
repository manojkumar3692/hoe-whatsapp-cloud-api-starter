import Link from "next/link";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

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

const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#dc2626", "#d97706", "#059669", "#0891b2"];

function avatar(name: string, size = 40) {
  const letter = (name || "?").trim().charAt(0).toUpperCase() || "?";
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {letter}
    </div>
  );
}

function relativeTime(iso: string) {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;

  return date.toLocaleDateString();
}

function Stat({ title, value, accent }: { title: string; value: any; accent: string }) {
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
      <div style={{ fontSize: 13, color: "#777" }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{value}</div>
    </div>
  );
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string;
    q?: string;
    backfilled?: string;
    backfill_skipped?: string;
  }>;
}) {
  const params = await searchParams;
  const filter = params.filter || "all";
  const search = (params.q || "").toLowerCase();

  const supabase = supabaseAdmin();

  const { data: messages, error } = await supabase
    .from("message_logs")
    .select(`
      id,
      phone,
      body,
      direction,
      status,
      template_name,
      created_at,
      customers (
        name,
        product,
        city
      )
    `)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Inbox</h1>
        <pre>{error.message}</pre>
      </main>
    );
  }

  const latestByPhone = new Map<string, any>();

  for (const msg of messages || []) {
    if (!latestByPhone.has(msg.phone)) {
      latestByPhone.set(msg.phone, msg);
    }
  }

  let chats = Array.from(latestByPhone.values());

  chats = chats.map((chat: any) => {
    const customer = Array.isArray(chat.customers)
      ? chat.customers[0]
      : chat.customers;

    return {
      ...chat,
      customer,
      needsReply: chat.direction === "inbound",
    };
  });

  if (filter === "needs_reply") {
    chats = chats.filter((c: any) => c.needsReply);
  }

  if (filter === "sent") {
    chats = chats.filter((c: any) => c.direction === "outbound");
  }

  if (search) {
    chats = chats.filter((c: any) =>
      [
        c.phone,
        c.body,
        c.template_name,
        c.customer?.name,
        c.customer?.product,
        c.customer?.city,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(search))
    );
  }

  chats.sort((a: any, b: any) => {
    if (a.needsReply && !b.needsReply) return -1;
    if (!a.needsReply && b.needsReply) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const totalChats = Array.from(latestByPhone.values()).length;
  const needsReplyCount = Array.from(latestByPhone.values()).filter(
    (m: any) => m.direction === "inbound"
  ).length;
  const outboundCount = Array.from(latestByPhone.values()).filter(
    (m: any) => m.direction === "outbound"
  ).length;

  const hasFilters = !!(params.q || (params.filter && params.filter !== "all"));

  return (
    <main style={{ padding: 24, background: "#fafafa", minHeight: "100vh" }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `.chat-row:hover { border-color: #cbd5e1 !important; box-shadow: 0 2px 10px rgba(0,0,0,.05); }`,
        }}
      />

      <nav style={{ marginBottom: 24 }}>
        <Link href="/">Home</Link>{" | "}
        <Link href="/orders">Orders</Link>{" | "}
        <Link href="/customers">Customers</Link>{" | "}
        <Link href="/campaigns">Campaigns</Link>{" | "}
        <Link href="/campaign-history">Campaign History</Link>{" | "}
        <Link href="/messages">Messages</Link>{" | "}
        <Link href="/templates">Templates</Link>
      </nav>

      <h1 style={{ marginBottom: 4 }}>Inbox</h1>
      <p style={{ color: "#666", marginBottom: 20 }}>
        Every WhatsApp conversation, newest and most urgent first.
      </p>

      {params.backfilled && (
        <div
          style={{
            background: "#dbeafe",
            color: "#1d4ed8",
            padding: 12,
            borderRadius: 10,
            marginBottom: 20,
            fontSize: 14,
          }}
        >
          Backfill complete: {params.backfilled} message preview(s) updated
          {params.backfill_skipped && Number(params.backfill_skipped) > 0
            ? `, ${params.backfill_skipped} skipped`
            : ""}
          .
        </div>
      )}

      <details
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
          🛠 Maintenance
        </summary>

        <p style={{ color: "#666", fontSize: 13, marginTop: 10, marginBottom: 12 }}>
          One-time cleanup: rewrites list preview text for older messages
          (photos, voice notes, button taps, locations...) that were saved
          before message types were parsed properly. Uses each message&apos;s
          original WhatsApp payload — nothing is deleted, and it&apos;s safe
          to run more than once.
        </p>

        <form
          action="/api/admin/backfill-message-bodies"
          method="POST"
          style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
        >
          <input
            type="password"
            name="admin_password"
            placeholder="Admin Password"
            required
            style={{ ...inputStyle, width: 220 }}
          />
          <button
            type="submit"
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: 0,
              background: "#111",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Backfill Previews
          </button>
        </form>
      </details>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <Stat title="Total Chats" value={totalChats} accent="#2563eb" />
        <Stat title="Needs Reply" value={needsReplyCount} accent="#16a34a" />
        <Stat title="Sent by Us" value={outboundCount} accent="#7c3aed" />
      </div>

      <form
        method="GET"
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 16,
          display: "grid",
          gridTemplateColumns: "2fr 1fr auto auto",
          gap: 12,
          marginBottom: 20,
          alignItems: "end",
        }}
      >
        <input
          name="q"
          defaultValue={params.q || ""}
          placeholder="Search name, phone, product, message..."
          style={inputStyle}
        />

        <select name="filter" defaultValue={filter} style={inputStyle}>
          <option value="all">All Chats</option>
          <option value="needs_reply">Needs Reply</option>
          <option value="sent">Sent by Us</option>
        </select>

        <button
          type="submit"
          style={{
            padding: "11px 18px",
            borderRadius: 8,
            border: 0,
            background: "#111",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Filter
        </button>

        {hasFilters && (
          <a
            href="/inbox"
            style={{
              padding: "11px 18px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fff",
              color: "#111",
              fontWeight: 600,
              textDecoration: "none",
              textAlign: "center",
            }}
          >
            Clear
          </a>
        )}
      </form>

      {chats.length === 0 && (
        <div
          style={{
            background: "#fff",
            border: "1px dashed #ddd",
            borderRadius: 14,
            padding: 40,
            textAlign: "center",
            color: "#888",
          }}
        >
          No chats found.
        </div>
      )}

      {chats.map((chat: any) => {
        const customer = chat.customer;

        return (
          <Link
            key={chat.phone}
            href={`/inbox/${chat.phone}`}
            className="chat-row"
            style={{
              display: "flex",
              gap: 14,
              alignItems: "flex-start",
              textDecoration: "none",
              color: "inherit",
              border: chat.needsReply ? "2px solid #16a34a" : "1px solid #e5e7eb",
              borderRadius: 14,
              padding: 16,
              marginBottom: 12,
              background: chat.needsReply ? "#f0fdf4" : "#fff",
              transition: "box-shadow .15s ease",
            }}
          >
            {avatar(customer?.name || chat.phone)}

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {customer?.name || "Unknown"}
                  </strong>
                  {chat.needsReply
                    ? badge("Needs Reply", "#dcfce7", "#166534")
                    : badge("Sent", "#e5e7eb", "#374151")}
                </div>

                <small style={{ color: "#666", flexShrink: 0 }} title={new Date(chat.created_at).toLocaleString()}>
                  {relativeTime(chat.created_at)}
                </small>
              </div>

              <div style={{ color: "#888", marginTop: 2, fontSize: 13 }}>
                {chat.phone}
                {customer?.product ? ` • ${customer.product}` : ""}
                {customer?.city ? ` • ${customer.city}` : ""}
              </div>

              <div
                style={{
                  marginTop: 8,
                  fontSize: 14,
                  color: "#333",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ color: "#999" }}>
                  {chat.direction === "inbound" ? "Customer: " : "You: "}
                </span>
                {chat.body || chat.template_name || "[message]"}
              </div>
            </div>
          </Link>
        );
      })}
    </main>
  );
}

const inputStyle = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "1px solid #ddd",
  boxSizing: "border-box" as const,
};

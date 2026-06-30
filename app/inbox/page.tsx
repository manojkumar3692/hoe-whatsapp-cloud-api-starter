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
      }}
    >
      {text}
    </span>
  );
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
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

  return (
    <main style={{ padding: 24, background: "#fafafa", minHeight: "100vh" }}>
      <nav style={{ marginBottom: 24 }}>
        <Link href="/">Home</Link>{" | "}
        <Link href="/orders">Orders</Link>{" | "}
        <Link href="/customers">Customers</Link>{" | "}
        <Link href="/campaigns">Campaigns</Link>{" | "}
        <Link href="/campaign-history">Campaign History</Link>{" | "}
        <Link href="/messages">Messages</Link>
      </nav>

      <h1>Inbox</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <Stat title="Total Chats" value={totalChats} />
        <Stat title="Needs Reply" value={needsReplyCount} />
        <Stat title="Sent by Us" value={outboundCount} />
      </div>

      <form
        method="GET"
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 16,
          display: "grid",
          gridTemplateColumns: "2fr 1fr auto",
          gap: 12,
          marginBottom: 20,
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
            padding: "10px 18px",
            borderRadius: 8,
            border: 0,
            background: "#111",
            color: "#fff",
            fontWeight: 700,
          }}
        >
          Filter
        </button>
      </form>

      {chats.length === 0 && <p>No chats found.</p>}

      {chats.map((chat: any) => {
        const customer = chat.customer;

        return (
          <Link
            key={chat.phone}
            href={`/inbox/${chat.phone}`}
            style={{
              display: "block",
              textDecoration: "none",
              color: "inherit",
              border: chat.needsReply ? "2px solid #16a34a" : "1px solid #e5e7eb",
              borderRadius: 14,
              padding: 16,
              marginBottom: 12,
              background: chat.needsReply ? "#f0fdf4" : "#fff",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <strong>{customer?.name || "Unknown"}</strong>{" "}
                {chat.needsReply
                  ? badge("Needs Reply", "#dcfce7", "#166534")
                  : badge("Sent", "#e5e7eb", "#374151")}
              </div>

              <small style={{ color: "#666" }}>
                {new Date(chat.created_at).toLocaleString()}
              </small>
            </div>

            <div style={{ color: "#666", marginTop: 6 }}>
              {chat.phone}
              {customer?.product ? ` • ${customer.product}` : ""}
              {customer?.city ? ` • ${customer.city}` : ""}
            </div>

            <div style={{ marginTop: 10, fontSize: 15 }}>
              <b>{chat.direction === "inbound" ? "Customer:" : "You:"}</b>{" "}
              {chat.body || chat.template_name || "[message]"}
            </div>

            <div style={{ marginTop: 8, fontSize: 12, color: "#777" }}>
              Status: {chat.status}
            </div>
          </Link>
        );
      })}
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

const inputStyle = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "1px solid #ddd",
};
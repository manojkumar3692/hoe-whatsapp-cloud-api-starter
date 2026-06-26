import Link from "next/link";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const supabase = supabaseAdmin();

  const { data: messages, error } = await supabase
    .from("message_logs")
    .select(`
      id,
      phone,
      body,
      direction,
      status,
      created_at,
      customers (
        name,
        product,
        city
      )
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return <main><h1>Inbox</h1><pre>{error.message}</pre></main>;
  }

  const latestByPhone = new Map<string, any>();

  for (const msg of messages || []) {
    if (!latestByPhone.has(msg.phone)) {
      latestByPhone.set(msg.phone, msg);
    }
  }

  const chats = Array.from(latestByPhone.values());

  return (
    <main style={{ padding: 24 }}>
      <nav style={{ marginBottom: 24 }}>
        <Link href="/">Home</Link>{" | "}
        <Link href="/customers">Customers</Link>{" | "}
        <Link href="/campaigns">Campaigns</Link>{" | "}
        <Link href="/messages">Messages</Link>
      </nav>

      <h1>Inbox</h1>

      <div style={{ marginTop: 20 }}>
        {chats.length === 0 && <p>No chats yet.</p>}

        {chats.map((chat: any) => {
          const customer = Array.isArray(chat.customers)
            ? chat.customers[0]
            : chat.customers;

          return (
            <Link
              key={chat.phone}
              href={`/inbox/${chat.phone}`}
              style={{
                display: "block",
                textDecoration: "none",
                color: "inherit",
                border: "1px solid #ddd",
                borderRadius: 10,
                padding: 16,
                marginBottom: 12,
                background: "#fff",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{customer?.name || "Unknown"}</strong>
                <small>{new Date(chat.created_at).toLocaleString()}</small>
              </div>

              <div style={{ color: "#666", marginTop: 4 }}>
                {chat.phone}
                {customer?.product ? ` • ${customer.product}` : ""}
                {customer?.city ? ` • ${customer.city}` : ""}
              </div>

              <div style={{ marginTop: 8 }}>
                <span>
                  {chat.direction === "inbound" ? "Customer: " : "You: "}
                </span>
                {chat.body || chat.template_name || "[message]"}
              </div>

              <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
                Status: {chat.status}
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
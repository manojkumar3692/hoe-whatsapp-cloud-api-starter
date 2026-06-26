import Link from "next/link";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ phone: string }>;
}) {
  const { phone: rawPhone } = await params;
  const phone = decodeURIComponent(rawPhone).replace(/\D/g, "");

  const supabase = supabaseAdmin();

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  const { data: messages, error } = await supabase
    .from("message_logs")
    .select("*")
    .eq("phone", phone)
    .order("created_at", { ascending: true });

  const { data: lastInbound } = await supabase
    .from("message_logs")
    .select("*")
    .eq("phone", phone)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let canReply = false;
  let hoursDiff = 999;

  if (lastInbound) {
    const lastInboundTime = new Date(lastInbound.created_at).getTime();
    hoursDiff = (Date.now() - lastInboundTime) / (1000 * 60 * 60);
    canReply = hoursDiff <= 24;
  }

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <pre>{error.message}</pre>
      </main>
    );
  }

  return (
    <main style={{ padding: 24 }}>
      <nav style={{ marginBottom: 24 }}>
        <Link href="/inbox">← Inbox</Link>{" | "}
        <Link href="/customers">Customers</Link>{" | "}
        <Link href="/campaigns">Campaigns</Link>
      </nav>

      <h1>{customer?.name || "Unknown Customer"}</h1>

      <p style={{ color: "#666" }}>
        Phone: {phone}
        {customer?.product ? ` • ${customer.product}` : ""}
        {customer?.city ? ` • ${customer.city}` : ""}
      </p>

      <p style={{ color: "#999", fontSize: 13 }}>
        Last inbound: {lastInbound?.created_at || "none"} | Hours diff:{" "}
        {hoursDiff.toFixed(2)}
      </p>

      <p style={{ color: canReply ? "green" : "red" }}>
        Reply window: {canReply ? "Open" : "Closed"}
      </p>

      <div
        style={{
          marginTop: 24,
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 16,
          background: "#f7f7f7",
        }}
      >
        {messages?.map((msg: any) => {
          const isInbound = msg.direction === "inbound";

          return (
            <div
              key={msg.id}
              style={{
                display: "flex",
                justifyContent: isInbound ? "flex-start" : "flex-end",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  maxWidth: "70%",
                  padding: 12,
                  borderRadius: 12,
                  background: isInbound ? "#fff" : "#dcf8c6",
                  border: "1px solid #ddd",
                }}
              >
                <div style={{ whiteSpace: "pre-wrap" }}>
                  {msg.body || msg.template_name || "[message]"}
                </div>

                <div
                  style={{
                    fontSize: 11,
                    color: "#777",
                    marginTop: 6,
                    textAlign: "right",
                  }}
                >
                  {new Date(msg.created_at).toLocaleString()} • {msg.status}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 20,
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 16,
        }}
      >
        <h2>Reply</h2>

        {canReply ? (
          <form action="/api/inbox/reply" method="POST">
            <input type="hidden" name="phone" value={phone} />

            <input
              type="password"
              name="admin_password"
              placeholder="Admin Password"
              required
              style={{ width: "100%", padding: 10, marginBottom: 10 }}
            />

            <textarea
              name="message"
              placeholder="Type your reply..."
              required
              rows={4}
              style={{ width: "100%", padding: 10, marginBottom: 10 }}
            />

            <button type="submit" style={{ padding: "10px 20px" }}>
              Send Reply
            </button>
          </form>
        ) : (
          <p style={{ color: "red" }}>
            24-hour reply window is closed. Send an approved template to restart
            the conversation.
          </p>
        )}
      </div>
    </main>
  );
}
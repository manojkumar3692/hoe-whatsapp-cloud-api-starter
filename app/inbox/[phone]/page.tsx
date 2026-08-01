import Link from "next/link";
import Header from "../../components/Header";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function formatINR(paise: number) {
  return `₹${((paise || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
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

function healthBadge(customer: any) {
  if (!customer) return null;
  if (customer.marketing_health === "cooldown") return badge("🔴 Cooldown", "#fee2e2", "#991b1b");
  if (customer.marketing_health === "warning") return badge("🟡 Warning", "#fef3c7", "#92400e");
  return badge("🟢 Healthy", "#dcfce7", "#166534");
}

const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#dc2626", "#d97706", "#059669", "#0891b2"];

function avatar(name: string, size = 48) {
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

function formatDateSeparator(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";

  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusTicks(status: string) {
  if (status === "failed") return <span style={{ color: "#dc2626" }}>⚠️ Failed</span>;
  if (status === "read") return <span style={{ color: "#2563eb" }}>✓✓ Read</span>;
  if (status === "delivered") return <span style={{ color: "#6b7280" }}>✓✓ Delivered</span>;
  if (status === "sent" || status === "accepted")
    return <span style={{ color: "#6b7280" }}>✓ Sent</span>;
  return <span style={{ color: "#9ca3af" }}>{status || "queued"}</span>;
}

// Renders the actual content of an inbound message based on its real
// WhatsApp type, instead of the old generic "[TYPE message]" placeholder.
// Reads straight from raw_response, which the webhook stores as the exact
// payload Meta sent us.
function renderInboundBody(msg: any) {
  const raw = msg.raw_response;
  const type = raw?.type;

  if (!raw || !type || type === "text") {
    return <div style={{ whiteSpace: "pre-wrap" }}>{msg.body || "[message]"}</div>;
  }

  if (type === "image" || type === "sticker") {
    const media = raw.image || raw.sticker;
    if (!media?.id) return <div>{msg.body}</div>;

    return (
      <div>
        <img
          src={`/api/media/${media.id}`}
          alt={type}
          style={{ maxWidth: 260, borderRadius: 10, display: "block" }}
        />
        {media.caption && <div style={{ marginTop: 6 }}>{media.caption}</div>}
      </div>
    );
  }

  if (type === "video") {
    if (!raw.video?.id) return <div>{msg.body}</div>;

    return (
      <div>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video controls style={{ maxWidth: 260, borderRadius: 10, display: "block" }}>
          <source src={`/api/media/${raw.video.id}`} type={raw.video?.mime_type} />
        </video>
        {raw.video.caption && <div style={{ marginTop: 6 }}>{raw.video.caption}</div>}
      </div>
    );
  }

  if (type === "audio") {
    if (!raw.audio?.id) return <div>{msg.body}</div>;

    return (
      <div>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
          {raw.audio?.voice ? "🎤 Voice message" : "🎵 Audio"}
        </div>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio controls src={`/api/media/${raw.audio.id}`} style={{ maxWidth: 240 }} />
      </div>
    );
  }

  if (type === "document") {
    if (!raw.document?.id) return <div>{msg.body}</div>;

    return (
      <a
        href={`/api/media/${raw.document.id}`}
        download={raw.document?.filename || true}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          background: "#f3f4f6",
          borderRadius: 8,
          color: "#111",
          textDecoration: "none",
        }}
      >
        📄 <span>{raw.document?.filename || "Document"}</span>
      </a>
    );
  }

  if (type === "location") {
    const lat = raw.location?.latitude;
    const lng = raw.location?.longitude;

    return (
      <a
        href={`https://www.google.com/maps?q=${lat},${lng}`}
        target="_blank"
        rel="noreferrer"
        style={{ color: "#2563eb", textDecoration: "none" }}
      >
        📍 {raw.location?.name || "Location shared"} — open in Google Maps
      </a>
    );
  }

  if (type === "contacts") {
    const contact = raw.contacts?.[0];

    return (
      <div>
        <div style={{ fontWeight: 700 }}>
          👤 {contact?.name?.formatted_name || "Contact shared"}
        </div>
        {(contact?.phones || []).map((p: any, i: number) => (
          <div key={i} style={{ fontSize: 13, color: "#666" }}>
            {p.phone}
          </div>
        ))}
      </div>
    );
  }

  if (type === "button") {
    return (
      <div>
        ↩️ <b>{raw.button?.text || "Button reply"}</b>
      </div>
    );
  }

  if (type === "interactive") {
    const reply = raw.interactive?.button_reply || raw.interactive?.list_reply;

    return (
      <div>
        ↩️ <b>{reply?.title || "Reply"}</b>
        {raw.interactive?.list_reply?.description && (
          <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
            {raw.interactive.list_reply.description}
          </div>
        )}
      </div>
    );
  }

  if (type === "reaction") {
    return <div style={{ fontSize: 22 }}>{raw.reaction?.emoji || "👍"}</div>;
  }

  if (type === "unsupported") {
    const reason = raw.errors?.[0]?.title || "Unsupported message type";
    const details = raw.errors?.[0]?.error_data?.details || raw.errors?.[0]?.message;

    return (
      <div style={{ color: "#92400e" }}>
        ⚠️ {reason}
        {details && (
          <div style={{ fontSize: 12, marginTop: 4, color: "#a16207" }}>{details}</div>
        )}
      </div>
    );
  }

  return <div>{msg.body || `[${type} message]`}</div>;
}

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
  let hoursLeft = 0;

  if (lastInbound) {
    const lastInboundTime = new Date(lastInbound.created_at).getTime();
    hoursDiff = (Date.now() - lastInboundTime) / (1000 * 60 * 60);
    canReply = hoursDiff <= 24;
    hoursLeft = Math.max(0, 24 - hoursDiff);
  }

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <pre>{error.message}</pre>
      </main>
    );
  }

  // Group messages with "Today" / "Yesterday" / date separators
  let lastDateLabel = "";

  return (
    <main style={{ padding: 24, background: "#fafafa", minHeight: "100vh" }}>
      <Header active="inbox" back={{ href: "/inbox", label: "Inbox" }} />

      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 20,
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {avatar(customer?.name || phone)}

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 style={{ margin: 0, fontSize: 20 }}>{customer?.name || "Unknown Customer"}</h1>
              {healthBadge(customer)}
            </div>

            <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
              {phone}
              {customer?.product ? ` • ${customer.product}` : ""}
              {customer?.city ? ` • ${customer.city}` : ""}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          {customer && (
            <>
              <div style={{ textAlign: "right" as const }}>
                <div style={{ fontSize: 11, color: "#999" }}>Orders</div>
                <div style={{ fontWeight: 700 }}>{customer.total_orders || 0}</div>
              </div>
              <div style={{ textAlign: "right" as const }}>
                <div style={{ fontSize: 11, color: "#999" }}>Lifetime Value</div>
                <div style={{ fontWeight: 700 }}>{formatINR(customer.lifetime_value_in_paise)}</div>
              </div>
              <Link
                href={`/customers/${customer.id}`}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid #ddd",
                  color: "#111",
                  textDecoration: "none",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                View Profile
              </Link>
            </>
          )}
        </div>
      </div>

      <div
        style={{
          padding: "10px 16px",
          borderRadius: 10,
          marginBottom: 16,
          background: canReply ? "#f0fdf4" : "#fef2f2",
          color: canReply ? "#166534" : "#991b1b",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {canReply
          ? `🟢 Reply window open — ${hoursLeft.toFixed(1)}h left before it closes`
          : "🔴 24-hour reply window closed — send an approved template to restart the conversation"}
      </div>

      <div
        id="chat-scroll"
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 16,
          background: "#efeae2",
          maxHeight: "60vh",
          overflowY: "auto",
        }}
      >
        {(messages || []).map((msg: any) => {
          const isInbound = msg.direction === "inbound";
          const dateLabel = formatDateSeparator(msg.created_at);
          const showSeparator = dateLabel !== lastDateLabel;
          lastDateLabel = dateLabel;

          return (
            <div key={msg.id}>
              {showSeparator && (
                <div style={{ display: "flex", justifyContent: "center", margin: "16px 0" }}>
                  <span
                    style={{
                      background: "#fff",
                      color: "#666",
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "4px 12px",
                      borderRadius: 999,
                      boxShadow: "0 1px 2px rgba(0,0,0,.08)",
                    }}
                  >
                    {dateLabel}
                  </span>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: isInbound ? "flex-start" : "flex-end",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    maxWidth: "70%",
                    padding: 12,
                    borderRadius: 12,
                    background: isInbound ? "#fff" : "#dcf8c6",
                    boxShadow: "0 1px 2px rgba(0,0,0,.08)",
                  }}
                >
                  {isInbound ? (
                    renderInboundBody(msg)
                  ) : (
                    <div style={{ whiteSpace: "pre-wrap" }}>
                      {msg.body || (msg.template_name ? `📨 Template: ${msg.template_name}` : "[message]")}
                    </div>
                  )}

                  <div
                    style={{
                      fontSize: 11,
                      color: "#777",
                      marginTop: 6,
                      textAlign: "right",
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 6,
                    }}
                  >
                    <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    {!isInbound && <span>• {statusTicks(msg.status)}</span>}
                  </div>

                  {!isInbound && msg.status === "failed" && msg.error && (
                    <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>{msg.error}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {(!messages || messages.length === 0) && (
          <div style={{ textAlign: "center", color: "#888", padding: 40 }}>
            No messages yet with this customer.
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 20,
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 20,
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Reply</h2>

        {canReply ? (
          <form action="/api/inbox/reply" method="POST">
            <input type="hidden" name="phone" value={phone} />

            <input
              type="password"
              name="admin_password"
              placeholder="Admin Password"
              required
              style={{ width: "100%", padding: 10, marginBottom: 10, borderRadius: 8, border: "1px solid #ddd", boxSizing: "border-box" }}
            />

            <textarea
              name="message"
              placeholder="Type your reply..."
              required
              rows={4}
              style={{ width: "100%", padding: 10, marginBottom: 10, borderRadius: 8, border: "1px solid #ddd", boxSizing: "border-box", fontFamily: "inherit" }}
            />

            <button
              type="submit"
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: 0,
                background: "#111",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Send Reply
            </button>
          </form>
        ) : (
          <div>
            <p style={{ color: "#991b1b", marginTop: 0 }}>
              24-hour reply window is closed. Send an approved template to restart the conversation.
            </p>
            <Link
              href="/campaigns"
              style={{
                display: "inline-block",
                padding: "10px 20px",
                borderRadius: 8,
                background: "#111",
                color: "#fff",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Send a Template
            </Link>
          </div>
        )}
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){var el=document.getElementById('chat-scroll'); if(el) el.scrollTop = el.scrollHeight;})();`,
        }}
      />
    </main>
  );
}

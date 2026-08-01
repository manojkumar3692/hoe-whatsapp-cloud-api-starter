import Link from "next/link";
import Header from "../components/Header";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { parseCartItems, cartItemName } from "../../lib/cartItems";
import { normalizePhone } from "../../lib/phone";

export const dynamic = "force-dynamic";

// Mirrors the defaults in
// /api/checkout-sessions/send-abandoned-cart-reminders/route.ts (the
// GitHub Actions workflow calls it with delay_minutes=30; max_age_hours
// isn't overridden anywhere so its 48h default applies). Only used here to
// explain *why* a session is in a given bucket — the real logic lives in
// that route.
const DELAY_MINUTES = 30;
const MAX_AGE_HOURS = 48;

type Status =
  | { kind: "converted" }
  | { kind: "sent"; at: string }
  | { kind: "skipped"; reason: string }
  | { kind: "not_due" }
  | { kind: "pending" }
  | { kind: "failed"; error: string | null; at: string }
  | { kind: "expired"; lastAttempt: { status: string; error: string | null; at: string } | null }
  | { kind: "no_phone" };

const STATUS_META: Record<
  Status["kind"],
  { label: string; bg: string; color: string }
> = {
  converted: { label: "Order placed", bg: "#dbeafe", color: "#1d4ed8" },
  sent: { label: "Reminder sent", bg: "#dcfce7", color: "#166534" },
  skipped: { label: "Skipped", bg: "#f3f4f6", color: "#374151" },
  not_due: { label: "Not due yet", bg: "#fef9c3", color: "#854d0e" },
  pending: { label: "Pending — due for next run", bg: "#ffedd5", color: "#9a3412" },
  failed: { label: "Send failed", bg: "#fee2e2", color: "#991b1b" },
  expired: { label: "Never attempted", bg: "#fee2e2", color: "#991b1b" },
  no_phone: { label: "No phone number", bg: "#f3f4f6", color: "#374151" },
};

function StatusPill({ status }: { status: Status }) {
  const meta = STATUS_META[status.kind];

  let detail: string | null = null;
  if (status.kind === "sent") detail = new Date(status.at).toLocaleString();
  if (status.kind === "skipped") detail = status.reason;
  if (status.kind === "failed") detail = status.error || "unknown error";
  if (status.kind === "expired" && status.lastAttempt) {
    detail = `Last attempt ${status.lastAttempt.status}${
      status.lastAttempt.error ? `: ${status.lastAttempt.error}` : ""
    } (${new Date(status.lastAttempt.at).toLocaleString()})`;
  }
  if (status.kind === "expired" && !status.lastAttempt) {
    detail = "No send attempt logged at all — window closed without the job ever trying";
  }

  return (
    <div>
      <span
        style={{
          background: meta.bg,
          color: meta.color,
          padding: "5px 10px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        {status.kind === "expired" ? "⚠️ " : ""}
        {meta.label}
      </span>
      {detail && (
        <div style={{ fontSize: 12, color: "#888", marginTop: 4, maxWidth: 320 }}>
          {detail}
        </div>
      )}
    </div>
  );
}

function computeStatus(
  session: any,
  customer: any,
  lastLog: { status: string; error: string | null; created_at: string } | null,
  linkedOrderPaymentStatus: string | null
): Status {
  // The storefront creates the orders row (and a Razorpay order) as soon as
  // checkout starts, before the customer has actually paid — so an
  // order_number alone does NOT mean they converted. Only a linked order
  // that's actually paid counts. See HOE-20260731-9T0CA / R00S7: both had
  // an order_number, both had zero Razorpay payment attempts.
  if (session.order_number && linkedOrderPaymentStatus === "paid") {
    return { kind: "converted" };
  }

  if (session.abandoned_cart_notified_at) {
    return { kind: "sent", at: session.abandoned_cart_notified_at };
  }

  const phone = normalizePhone(session.phone || "");
  if (!phone) {
    return { kind: "no_phone" };
  }

  if (customer?.opt_out) return { kind: "skipped", reason: "Customer opted out" };
  if (customer?.blocked) return { kind: "skipped", reason: "Customer blocked" };
  if (customer?.marketing_health === "cooldown") {
    return { kind: "skipped", reason: "Number in marketing cooldown" };
  }

  const ageMs = Date.now() - new Date(session.created_at).getTime();
  const ageMinutes = ageMs / 60000;
  const ageHours = ageMs / 3600000;

  if (ageMinutes < DELAY_MINUTES) {
    return { kind: "not_due" };
  }

  if (ageHours > MAX_AGE_HOURS) {
    if (lastLog && lastLog.status === "failed") {
      return {
        kind: "failed",
        error: lastLog.error,
        at: lastLog.created_at,
      };
    }

    return {
      kind: "expired",
      lastAttempt: lastLog
        ? { status: lastLog.status, error: lastLog.error, at: lastLog.created_at }
        : null,
    };
  }

  if (lastLog && lastLog.status === "failed") {
    return { kind: "failed", error: lastLog.error, at: lastLog.created_at };
  }

  return { kind: "pending" };
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
      <div style={{ color: "#777", fontSize: 13 }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{value}</div>
    </div>
  );
}

export default async function AbandonedCartsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const supabase = supabaseAdmin();

  const { data: rawSessions, error } = await supabase
    .from("checkout_sessions")
    .select(
      "id, name, phone, email, city, cart_items, created_at, order_number, abandoned_cart_notified_at"
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Abandoned Carts</h1>
        <pre>{error.message}</pre>
      </main>
    );
  }

  const sessions = rawSessions || [];

  const phones = [
    ...new Set(sessions.map((s: any) => normalizePhone(s.phone || "")).filter(Boolean)),
  ];

  const orderNumbers = [
    ...new Set(sessions.map((s: any) => s.order_number).filter(Boolean)),
  ];

  const [{ data: customers }, { data: logs }, { data: linkedOrders }] = await Promise.all([
    phones.length
      ? supabase
          .from("customers")
          .select("phone, opt_out, blocked, marketing_health")
          .in("phone", phones)
      : Promise.resolve({ data: [] as any[] }),
    phones.length
      ? supabase
          .from("message_logs")
          .select("phone, status, error, created_at, body")
          .in("phone", phones)
          .order("created_at", { ascending: false })
          .limit(1000)
      : Promise.resolve({ data: [] as any[] }),
    orderNumbers.length
      ? supabase
          .from("orders")
          .select("order_number, payment_status, amount_in_paise")
          .in("order_number", orderNumbers)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const customerByPhone = new Map((customers || []).map((c: any) => [c.phone, c]));
  const orderByNumber = new Map((linkedOrders || []).map((o: any) => [o.order_number, o]));

  // Most recent abandoned-cart-reminder attempt per phone (send successes
  // are already covered by abandoned_cart_notified_at on the session
  // itself — this is specifically for spotting failed attempts).
  const lastLogByPhone = new Map<string, any>();
  for (const log of logs || []) {
    if (!String(log.body || "").startsWith("Abandoned cart reminder")) continue;
    if (!lastLogByPhone.has(log.phone)) {
      lastLogByPhone.set(log.phone, log);
    }
  }

  const rows = sessions.map((session: any) => {
    const phone = normalizePhone(session.phone || "");
    const customer = customerByPhone.get(phone);
    const lastLog = lastLogByPhone.get(phone) || null;
    const linkedOrder = session.order_number ? orderByNumber.get(session.order_number) : null;
    const status = computeStatus(session, customer, lastLog, linkedOrder?.payment_status || null);
    return { session, status, linkedOrder };
  });

  const counts = rows.reduce((acc: Record<string, number>, r) => {
    acc[r.status.kind] = (acc[r.status.kind] || 0) + 1;
    return acc;
  }, {});

  const filtered = params.status
    ? rows.filter((r) => r.status.kind === params.status)
    : rows;

  return (
    <main style={{ padding: 24, background: "#fafafa", minHeight: "100vh" }}>
      <Header active="abandoned-carts" />

      <h1 style={{ marginBottom: 4 }}>Abandoned Carts</h1>
      <p style={{ color: "#666", marginBottom: 20 }}>
        Every checkout session that reached the phone-number step, and whether the automated
        WhatsApp reminder actually went out. Reminders fire {DELAY_MINUTES} minutes after
        checkout and stop being attempted after {MAX_AGE_HOURS}h.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 12,
        }}
      >
        <Stat title="Total Checkouts" value={sessions.length} accent="#2563eb" />
        <Stat title="Converted to Order" value={counts.converted || 0} accent="#1d4ed8" />
        <Stat title="Reminder Sent" value={counts.sent || 0} accent="#16a34a" />
        <Stat title="Pending / Not Due" value={(counts.pending || 0) + (counts.not_due || 0)} accent="#d97706" />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <Stat title="Skipped (opt-out/blocked/cooldown)" value={counts.skipped || 0} accent="#6b7280" />
        <Stat title="Send Failed" value={counts.failed || 0} accent="#991b1b" />
        <Stat title="⚠️ Never Attempted (needs investigation)" value={counts.expired || 0} accent="#dc2626" />
      </div>

      <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {Object.keys(STATUS_META).map((kind) => (
          <a
            key={kind}
            href={`/abandoned-carts${params.status === kind ? "" : `?status=${kind}`}`}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              textDecoration: "none",
              border: params.status === kind ? "2px solid #111" : "1px solid #ddd",
              background: params.status === kind ? "#111" : "#fff",
              color: params.status === kind ? "#fff" : "#374151",
            }}
          >
            {STATUS_META[kind as Status["kind"]].label} ({counts[kind] || 0})
          </a>
        ))}
        {params.status && (
          <a
            href="/abandoned-carts"
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              textDecoration: "none",
              border: "1px solid #ddd",
              background: "#fff",
              color: "#374151",
            }}
          >
            Clear filter
          </a>
        )}
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead style={{ background: "#f9fafb" }}>
              <tr>
                <th style={th}>Customer</th>
                <th style={th}>Cart</th>
                <th style={th}>Checked out</th>
                <th style={th}>Status</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map(({ session, status, linkedOrder }) => {
                const items = parseCartItems(session.cart_items);
                const whatsappPhone = normalizePhone(session.phone || "");
                const hasUnpaidOrder = linkedOrder && linkedOrder.payment_status !== "paid";

                return (
                  <tr key={session.id}>
                    <td style={td}>
                      <div style={{ fontWeight: 700 }}>{session.name || "Unknown"}</div>
                      <div style={{ color: "#888", fontSize: 12 }}>{session.phone || "-"}</div>
                      {whatsappPhone && (
                        <Link
                          href={`/inbox/${whatsappPhone}`}
                          style={{ fontSize: 12, color: "#166534" }}
                        >
                          💬 View chat
                        </Link>
                      )}
                    </td>
                    <td style={td}>
                      {items.length === 0
                        ? "-"
                        : `${cartItemName(items[0]) || "Item"}${
                            items.length > 1 ? ` +${items.length - 1} more` : ""
                          }`}
                      {hasUnpaidOrder && (
                        <div style={{ fontSize: 11, color: "#9a3412", marginTop: 4 }}>
                          ⚠️ Reached checkout — order{" "}
                          <Link
                            href={`/orders?q=${encodeURIComponent(session.order_number)}`}
                            style={{ color: "#9a3412" }}
                          >
                            {session.order_number}
                          </Link>{" "}
                          created but never paid ({linkedOrder.payment_status})
                        </div>
                      )}
                    </td>
                    <td style={td}>{new Date(session.created_at).toLocaleString()}</td>
                    <td style={td}>
                      <StatusPill status={status} />
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td style={td} colSpan={4}>
                    No checkout sessions match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
  whiteSpace: "nowrap" as const,
};

const td = {
  padding: 12,
  borderBottom: "1px solid #f1f1f1",
  fontSize: 14,
  verticalAlign: "top" as const,
};

import Link from "next/link";
import Header from "./components/Header";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { normalizePhone } from "../lib/phone";

export const dynamic = "force-dynamic";

function formatINR(paise: number) {
  return `₹${((paise || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function badge(value: string, bg: string, color: string) {
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
      {value}
    </span>
  );
}

function shippingBadge(status: string) {
  const colors: Record<string, [string, string]> = {
    pending: ["#fef9c3", "#854d0e"],
    confirmed: ["#dbeafe", "#1d4ed8"],
    packed: ["#dbeafe", "#1d4ed8"],
    shipped: ["#e0e7ff", "#3730a3"],
    out_for_delivery: ["#fce7f3", "#9d174d"],
    delivered: ["#dcfce7", "#166534"],
    completed: ["#dcfce7", "#166534"],
    cancelled: ["#fee2e2", "#991b1b"],
    returned: ["#e5e7eb", "#374151"],
  };
  const [bg, color] = colors[status] || ["#f3f4f6", "#374151"];
  return badge(status, bg, color);
}

export default async function Home() {
  const supabase = supabaseAdmin();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    { data: customers },
    { data: orders },
    { data: campaigns },
    { data: messages },
    { data: cartSessions },
  ] = await Promise.all([
    supabase.from("customers").select("*"),
    supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("campaigns").select("*").order("created_at", { ascending: false }).limit(5),
    supabase.from("message_logs").select("*").order("created_at", { ascending: false }).limit(100),
    supabase
      .from("checkout_sessions")
      .select("id, order_number, abandoned_cart_notified_at, created_at")
      .is("abandoned_cart_notified_at", null)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  // Abandoned-cart KPI: a session only counts as converted once its linked
  // order is actually paid — see /abandoned-carts for the full breakdown
  // and why an order_number alone doesn't mean "converted."
  const sessionOrderNumbers = [
    ...new Set((cartSessions || []).map((s: any) => s.order_number).filter(Boolean)),
  ];

  const { data: linkedOrders } = sessionOrderNumbers.length
    ? await supabase
        .from("orders")
        .select("order_number, payment_status")
        .in("order_number", sessionOrderNumbers)
    : { data: [] as any[] };

  const paidOrderNumbers = new Set(
    (linkedOrders || []).filter((o: any) => o.payment_status === "paid").map((o: any) => o.order_number)
  );

  const abandonedCartsPending = (cartSessions || []).filter(
    (s: any) => !s.order_number || !paidOrderNumbers.has(s.order_number)
  ).length;

  const todayOrders = orders?.filter((o: any) => new Date(o.created_at) >= today) || [];

  const todayRevenue = todayOrders.reduce(
    (sum: number, o: any) => (o.payment_status === "paid" ? sum + (o.amount_in_paise || 0) : sum),
    0
  );

  const totalRevenue =
    orders?.reduce(
      (sum: number, o: any) => (o.payment_status === "paid" ? sum + (o.amount_in_paise || 0) : sum),
      0
    ) || 0;

  const pendingShipments =
    orders?.filter((o: any) => ["pending", "confirmed", "packed"].includes(o.shipping_status)).length || 0;

  const codPending =
    orders?.filter((o: any) => o.payment_type === "partial_cod" && o.cod_balance_status === "pending")
      .length || 0;

  const healthy = customers?.filter((c: any) => c.marketing_health === "healthy").length || 0;
  const warning = customers?.filter((c: any) => c.marketing_health === "warning").length || 0;
  const cooldown = customers?.filter((c: any) => c.marketing_health === "cooldown").length || 0;

  const latestReplies = messages?.filter((m: any) => m.direction === "inbound").slice(0, 5) || [];
  const failedMessages = messages?.filter((m: any) => m.status === "failed").length || 0;

  const alerts: { text: string; href: string; tone: "warn" | "danger" }[] = [];

  if (abandonedCartsPending > 0) {
    alerts.push({
      text: `${abandonedCartsPending} checkout${abandonedCartsPending === 1 ? "" : "s"} abandoned and not yet reminded — review who needs a nudge`,
      href: "/abandoned-carts",
      tone: "warn",
    });
  }

  if (codPending > 0) {
    alerts.push({
      text: `${codPending} COD order${codPending === 1 ? "" : "s"} waiting on balance collection`,
      href: "/orders?payment_type=partial_cod",
      tone: "warn",
    });
  }

  if (cooldown > 0) {
    alerts.push({
      text: `${cooldown} customer${cooldown === 1 ? "" : "s"} in marketing cooldown — messages to them are paused`,
      href: "/customers",
      tone: "danger",
    });
  }

  if (failedMessages > 0) {
    alerts.push({
      text: `${failedMessages} message${failedMessages === 1 ? "" : "s"} failed to deliver recently`,
      href: "/messages",
      tone: "danger",
    });
  }

  return (
    <main>
      <Header active="home" />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0 }}>Welcome back</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Here's what's happening across orders, customers, and WhatsApp today —{" "}
            {today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}.
          </p>
        </div>
      </div>

      {alerts.length > 0 && (
        <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          {alerts.map((a, i) => (
            <Link
              key={i}
              href={a.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                textDecoration: "none",
                background: a.tone === "danger" ? "#fef2f2" : "#fffbeb",
                border: `1px solid ${a.tone === "danger" ? "#fecaca" : "#fde68a"}`,
                color: a.tone === "danger" ? "#991b1b" : "#92400e",
                borderRadius: 12,
                padding: "12px 16px",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              <span>{a.tone === "danger" ? "🔴" : "🟡"}</span>
              <span style={{ flex: 1 }}>{a.text}</span>
              <span>View →</span>
            </Link>
          ))}
        </div>
      )}

      <h2 style={{ fontSize: 15, color: "#9a8f80", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
        Today
      </h2>

      <div style={grid4}>
        <StatCard title="Revenue Today" value={formatINR(todayRevenue)} accent="#166534" href="/orders?date=today" />
        <StatCard title="Orders Today" value={todayOrders.length} accent="#1d4ed8" href="/orders?date=today" />
        <StatCard title="Pending Shipments" value={pendingShipments} accent="#9a3412" href="/orders" />
        <StatCard
          title="Abandoned Carts"
          value={abandonedCartsPending}
          accent={abandonedCartsPending > 0 ? "#991b1b" : "#166534"}
          href="/abandoned-carts"
        />
      </div>

      <h2 style={{ fontSize: 15, color: "#9a8f80", textTransform: "uppercase", letterSpacing: 0.5, margin: "24px 0 10px" }}>
        Overall
      </h2>

      <div style={grid4}>
        <StatCard title="Total Customers" value={customers?.length || 0} accent="#1d4ed8" href="/customers" />
        <StatCard title="Total Revenue" value={formatINR(totalRevenue)} accent="#166534" href="/orders" />
        <StatCard title="Recent Replies" value={latestReplies.length} accent="#1d4ed8" href="/inbox" />
        <div style={card}>
          <div style={{ color: "#9a8f80", fontSize: 13, marginBottom: 8 }}>WhatsApp Account Health</div>
          <div style={{ display: "flex", gap: 14 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#166534" }}>{healthy}</div>
              <div style={{ fontSize: 11, color: "#9a8f80" }}>Healthy</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#92400e" }}>{warning}</div>
              <div style={{ fontSize: 11, color: "#9a8f80" }}>Warning</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#991b1b" }}>{cooldown}</div>
              <div style={{ fontSize: 11, color: "#9a8f80" }}>Cooldown</div>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr",
          gap: 20,
          marginTop: 30,
        }}
      >
        <section className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>Recent Orders</h2>
            <Link href="/orders" style={{ fontSize: 13 }}>
              View all →
            </Link>
          </div>

          {(orders || []).slice(0, 6).map((o: any) => {
            const whatsappPhone = normalizePhone(o.customer_phone || "");
            return (
              <div key={o.id} style={row}>
                <div>
                  <Link href={`/orders/${o.id}`} style={{ fontWeight: 700, textDecoration: "none", color: "#1c1712" }}>
                    {o.order_number}
                  </Link>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {o.customer_name} • {o.customer_phone}
                    {whatsappPhone && (
                      <>
                        {" "}
                        ·{" "}
                        <Link href={`/inbox/${whatsappPhone}`} style={{ color: "#166534" }}>
                          💬 chat
                        </Link>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700 }}>{formatINR(o.amount_in_paise)}</div>
                  <div style={{ marginTop: 4 }}>{shippingBadge(o.shipping_status)}</div>
                </div>
              </div>
            );
          })}

          {(orders || []).length === 0 && <p className="muted">No orders yet.</p>}
        </section>

        <section className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>Latest Replies</h2>
            <Link href="/inbox" style={{ fontSize: 13 }}>
              Open inbox →
            </Link>
          </div>

          {latestReplies.length === 0 && <p className="muted">No recent replies.</p>}

          {latestReplies.map((m: any) => (
            <div key={m.id} style={row}>
              <div>
                <b>{m.phone}</b>
                <div className="muted" style={{ fontSize: 13 }}>{m.body || "[message]"}</div>
              </div>

              <Link href={`/inbox/${m.phone}`} style={{ fontSize: 13 }}>
                Open
              </Link>
            </div>
          ))}
        </section>
      </div>

      <section className="card" style={{ marginTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Recent Campaigns</h2>
          <Link href="/campaign-history" style={{ fontSize: 13 }}>
            View all →
          </Link>
        </div>

        <table style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Template</th>
              <th>Audience</th>
              <th>Sent</th>
              <th>Failed</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {(campaigns || []).map((c: any) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.template_name}</td>
                <td>{c.total_recipients || 0}</td>
                <td>{c.sent_count || 0}</td>
                <td>{c.failed_count || 0}</td>
                <td>{badge(c.status, "#e5e7eb", "#374151")}</td>
                <td>
                  <Link href={`/campaign-history/${c.id}`}>View</Link>
                </td>
              </tr>
            ))}

            {(!campaigns || campaigns.length === 0) && (
              <tr>
                <td colSpan={7} className="muted">
                  No campaigns sent yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function StatCard({
  title,
  value,
  accent,
  href,
}: {
  title: string;
  value: any;
  accent: string;
  href: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      <div style={{ ...card, borderLeft: `4px solid ${accent}`, cursor: "pointer" }}>
        <div style={{ color: "#9a8f80", fontSize: 13 }}>{title}</div>
        <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, color: "#1c1712" }}>{value}</div>
      </div>
    </Link>
  );
}

const grid4 = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 16,
};

const card = {
  background: "#fff",
  border: "1px solid #eadfce",
  borderRadius: 14,
  padding: 16,
  boxShadow: "0 8px 22px rgba(0,0,0,.04)",
};

const row = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  borderBottom: "1px solid #f1ece1",
  padding: "12px 0",
};

import Link from "next/link";
import Header from "../components/Header";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { formatFollowupStatus, followupBadgeColors, orderItemNames } from "../../lib/followups";
import { normalizePhone } from "../../lib/phone";
import styles from "./follow-ups.module.css";

export const dynamic = "force-dynamic";

const OPEN_STATUSES = ["due", "in_progress", "call_later", "awaiting_reply", "interested", "issue"];

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Dubai", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function Badge({ status }: { status: string }) {
  const [background, color] = followupBadgeColors(status);
  return <span className={styles.badge} style={{ background, color }}>{formatFollowupStatus(status)}</span>;
}

export default async function FollowupsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; type?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const view = params.view || "due";
  const supabase = supabaseAdmin();

  const { data: rawFollowups, error } = await supabase
    .from("customer_followups")
    .select("*")
    .order("next_action_at", { ascending: true, nullsFirst: false })
    .order("due_at", { ascending: true })
    .limit(500);

  if (error) {
    return <main className={styles.page}><Header active="follow-ups" /><h1>Follow-ups</h1><p>Run migration <code>009_customer_followups.sql</code> first.</p><pre>{error.message}</pre></main>;
  }

  const followups = rawFollowups || [];
  const orderIds = followups.map((f: any) => f.order_id);
  const customerIds = followups.map((f: any) => f.customer_id).filter(Boolean);
  const [{ data: orders }, { data: customers }] = await Promise.all([
    orderIds.length ? supabase.from("orders").select("*").in("id", orderIds) : Promise.resolve({ data: [] as any[] }),
    customerIds.length ? supabase.from("customers").select("id,name,phone,opt_out,blocked").in("id", customerIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const ordersById = new Map((orders || []).map((o: any) => [o.id, o]));
  const customersById = new Map((customers || []).map((c: any) => [c.id, c]));
  const now = Date.now();

  const stats = {
    due: followups.filter((f: any) => OPEN_STATUSES.includes(f.status) && new Date(f.next_action_at || f.due_at).getTime() <= now).length,
    call_later: followups.filter((f: any) => f.status === "call_later").length,
    awaiting_reply: followups.filter((f: any) => f.status === "awaiting_reply").length,
    interested: followups.filter((f: any) => f.status === "interested").length,
    issue: followups.filter((f: any) => f.status === "issue").length,
    completed: followups.filter((f: any) => ["completed", "no_response", "not_interested"].includes(f.status)).length,
  };

  let rows = followups.filter((f: any) => {
    if (view === "all") return f.status !== "cancelled";
    if (view === "due") return OPEN_STATUSES.includes(f.status) && new Date(f.next_action_at || f.due_at).getTime() <= now;
    if (view === "completed") return ["completed", "no_response", "not_interested"].includes(f.status);
    return f.status === view;
  });
  if (params.type) rows = rows.filter((f: any) => f.followup_type === params.type);
  if (params.q?.trim()) {
    const q = params.q.toLowerCase().trim();
    rows = rows.filter((f: any) => {
      const o: any = ordersById.get(f.order_id);
      const c: any = customersById.get(f.customer_id);
      return [o?.order_number, o?.customer_name, o?.customer_phone, c?.name, c?.phone]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
    });
  }

  const tabs = [
    ["due", "Due Today", stats.due], ["call_later", "Call Later", stats.call_later],
    ["awaiting_reply", "Awaiting Reply", stats.awaiting_reply], ["interested", "Interested", stats.interested],
    ["issue", "Issues", stats.issue], ["completed", "Completed", stats.completed], ["all", "All", followups.filter((f: any) => f.status !== "cancelled").length],
  ] as const;

  return (
    <main className={styles.page}>
      <Header active="follow-ups" />
      <div className={styles.heading}>
        <div><h1>Customer Follow-ups</h1><p>Feedback and next actions for fully paid, delivered purchases.</p></div>
      </div>
      {params.saved && <div style={{ background: "#dcfce7", color: "#166534", padding: 12, borderRadius: 10, marginBottom: 16 }}>Follow-up updated.</div>}
      <div className={styles.stats}>
        <div className={styles.stat}><span>Due now</span><strong>{stats.due}</strong></div>
        <div className={styles.stat}><span>Call later</span><strong>{stats.call_later}</strong></div>
        <div className={styles.stat}><span>Interested to buy</span><strong>{stats.interested}</strong></div>
        <div className={styles.stat}><span>Customer issues</span><strong>{stats.issue}</strong></div>
      </div>
      <section className={styles.workspace}>
        <div className={styles.tabs}>
          {tabs.map(([key, label, count]) => <Link key={key} href={`/follow-ups?view=${key}`} className={`${styles.tab} ${view === key ? styles.active : ""}`}>{label} ({count})</Link>)}
        </div>
        <form className={styles.filters} method="GET">
          <input type="hidden" name="view" value={view} />
          <input name="q" defaultValue={params.q || ""} placeholder="Search name, phone or order number" />
          <select name="type" defaultValue={params.type || ""}><option value="">All purchases</option><option value="trial_pack">Trial packs</option><option value="regular_purchase">Regular purchases</option></select>
          <button type="submit">Apply</button>
        </form>
        <div className={styles.tableWrap}>
          <table role="table" className={styles.table + " mobile-table"}>
            <thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">Customer</th><th role="columnheader" scope="col">Phone</th><th role="columnheader" scope="col">Order</th><th role="columnheader" scope="col">Purchase</th><th role="columnheader" scope="col">Delivered</th><th role="columnheader" scope="col">Attempts</th><th role="columnheader" scope="col">Next action</th><th role="columnheader" scope="col">Status</th><th role="columnheader" scope="col">Actions</th></tr></thead>
            <tbody role="rowgroup">
              {rows.map((f: any) => {
                const order: any = ordersById.get(f.order_id) || {};
                const customer: any = customersById.get(f.customer_id) || {};
                const phone = normalizePhone(order.customer_phone || customer.phone || "");
                const actionAt = f.next_action_at || f.due_at;
                const overdue = actionAt && new Date(actionAt).getTime() <= now && OPEN_STATUSES.includes(f.status);
                return <tr role="row" key={f.id}>
                  <td data-label="Customer" role="cell"><Link className={styles.name} href={`/follow-ups/${f.id}`}>{order.customer_name || customer.name || "Unknown"}</Link><div className={styles.subtle}>{f.followup_type === "trial_pack" ? "Trial pack" : "Regular purchase"}</div></td>
                  <td data-label="Phone" role="cell"><a href={`tel:+${phone}`}>{order.customer_phone || customer.phone || "-"}</a>{(customer.opt_out || customer.blocked) && <div className={styles.subtle} style={{ color: "#991b1b" }}>Do not message</div>}</td>
                  <td data-label="Order" role="cell"><Link href={`/orders/${order.id}`}>{order.order_number || "-"}</Link><div className={styles.subtle}>{orderItemNames(order.items).join(", ") || "-"}</div></td>
                  <td data-label="Purchase" role="cell">{f.followup_type === "trial_pack" ? "Trial Pack" : "Perfume"}</td>
                  <td data-label="Delivered" role="cell">{formatDate(f.delivered_at)}</td><td data-label="Attempts" role="cell">{f.attempt_count}</td>
                  <td data-label="Next action" role="cell" className={overdue ? styles.overdue : ""}>{formatDate(actionAt)}<div className={styles.subtle}>{f.next_action || (overdue ? "Contact customer" : "Scheduled")}</div></td>
                  <td data-label="Status" role="cell"><Badge status={f.status} /></td>
                  <td data-label="Actions" role="cell"><div className={styles.actions}><a className={`${styles.action} ${styles.call}`} href={`tel:+${phone}`}>☎ Call</a><Link className={styles.action} href={`/inbox/${phone}`}>WhatsApp</Link><Link className={styles.action} href={`/follow-ups/${f.id}`}>Feedback</Link></div></td>
                </tr>;
              })}
            </tbody>
          </table>
          {rows.length === 0 && <div className={styles.empty}>No follow-ups in this view.</div>}
        </div>
      </section>
    </main>
  );
}


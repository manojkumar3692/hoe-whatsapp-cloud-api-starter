import Link from "next/link";
import Header from "../../components/Header";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { formatFollowupStatus, followupBadgeColors, orderItemNames, trialPackFragrances } from "../../../lib/followups";
import { normalizePhone } from "../../../lib/phone";

export const dynamic = "force-dynamic";

function displayDate(value: string | null) {
  return value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" }) : "-";
}

function nextDayInput() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(Date.now() + 86400000));
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

const card: React.CSSProperties = { background: "#fff", border: "1px solid #eadfce", borderRadius: 16, padding: 18 };
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: 10, border: "1px solid #d9cdbb", borderRadius: 9, marginTop: 5, background: "#fffdf9" };
const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#655b50" };
const button: React.CSSProperties = { padding: "10px 14px", border: 0, borderRadius: 9, background: "#1c1712", color: "#fff", fontWeight: 700, cursor: "pointer" };

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><label style={label}>{title}</label>{children}</div>;
}

export default async function FollowupDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = supabaseAdmin();
  const { data: followup, error } = await supabase.from("customer_followups").select("*").eq("id", id).maybeSingle();
  if (error || !followup) return <main style={{ padding: 24 }}><Link href="/follow-ups">← Follow-ups</Link><h1>Follow-up not found</h1><pre>{error?.message}</pre></main>;

  const [{ data: order }, { data: customer }, { data: attempts }] = await Promise.all([
    supabase.from("orders").select("*").eq("id", followup.order_id).maybeSingle(),
    followup.customer_id ? supabase.from("customers").select("*").eq("id", followup.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("customer_followup_attempts").select("*").eq("followup_id", id).order("created_at", { ascending: false }),
  ]);
  const phone = normalizePhone(order?.customer_phone || customer?.phone || "");
  const products = orderItemNames(order?.items);
  const fragranceChoices = followup.followup_type === "trial_pack" ? trialPackFragrances(order?.items) : products;
  const [badgeBg, badgeColor] = followupBadgeColors(followup.status);
  const trial = followup.followup_type === "trial_pack";

  return <main style={{ padding: 24, background: "#faf8f4", minHeight: "100vh", color: "#1c1712" }}>
    <Header active="follow-ups" back={{ href: "/follow-ups", label: "Follow-ups" }} />
    <div className="responsive-row" style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 18 }}>
      <div><h1 style={{ margin: "0 0 4px" }}>{order?.customer_name || customer?.name || "Customer"}</h1><div style={{ color: "#756b5f" }}>{order?.customer_phone || customer?.phone} · Order <Link href={`/orders/${order?.id}`}>{order?.order_number}</Link></div></div>
      <span style={{ background: badgeBg, color: badgeColor, padding: "7px 12px", borderRadius: 999, fontWeight: 750, fontSize: 13 }}>{formatFollowupStatus(followup.status)}</span>
    </div>
    {query.saved && <div style={{ background: "#dcfce7", color: "#166534", padding: 12, borderRadius: 10, marginBottom: 16 }}>Saved successfully.</div>}

    <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(310px, .9fr)", gap: 16, alignItems: "start" }}>
      <div style={{ display: "grid", gap: 16 }}>
        <section style={card}>
          <h2 style={{ marginTop: 0 }}>Purchase</h2>
          <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
            <div><small style={label}>Type</small><div>{trial ? "Trial Pack" : "Regular perfume purchase"}</div></div>
            <div><small style={label}>Delivered</small><div>{displayDate(followup.delivered_at)}</div></div>
            <div><small style={label}>Products</small><div>{products.join(", ") || "-"}</div></div>
            <div><small style={label}>First follow-up due</small><div>{displayDate(followup.due_at)}</div></div>
          </div>
        </section>

        <section style={card}>
          <h2 style={{ marginTop: 0 }}>Enter customer feedback</h2>
          <p style={{ color: "#756b5f", marginTop: -4 }}>{trial ? "Record what the customer thought of the trial selection and what they may buy next." : "Record product experience, satisfaction and repurchase interest."}</p>
          <form action="/api/follow-ups/update" method="POST">
            <input type="hidden" name="id" value={id} />
            <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
              <Field title="Outcome"><select name="feedback_outcome" defaultValue={followup.feedback_outcome || ""} required style={input}>
                <option value="" disabled>Select outcome</option>
                {trial ? <><option value="liked_all">Liked all perfumes</option><option value="favorite_selected">Selected one favourite</option><option value="multiple_favorites">Selected multiple favourites</option><option value="still_deciding">Still deciding</option><option value="none_liked">Did not like any</option></> : <><option value="positive">Positive</option><option value="neutral">Neutral</option><option value="negative">Negative</option></>}
                <option value="product_issue">Damaged, leaking, wrong item or other issue</option><option value="safety_concern">Skin reaction or safety concern</option><option value="not_interested">Not interested</option>
              </select></Field>
              <Field title="Rating"><select name="rating" defaultValue={followup.rating || ""} style={input}><option value="">Not provided</option>{[5,4,3,2,1].map((n) => <option key={n} value={n}>{n} / 5</option>)}</select></Field>
            </div>

            {fragranceChoices.length > 0 && <div style={{ marginTop: 16 }}><div style={label}>{trial ? "Favourite perfume(s) from this pack" : "Product(s) discussed"}</div><div className="responsive-row" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>{fragranceChoices.map((name) => <label key={name} style={{ border: "1px solid #dfd4c5", padding: "8px 10px", borderRadius: 9 }}><input type="checkbox" name="favorite_perfumes" value={name} defaultChecked={(followup.favorite_perfumes || []).includes(name)} /> {name}</label>)}</div></div>}

            <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14, marginTop: 16 }}>
              <Field title="Longevity"><select name="longevity_feedback" defaultValue={followup.longevity_feedback || ""} style={input}><option value="">Not discussed</option><option value="poor">Poor</option><option value="average">Average</option><option value="good">Good</option><option value="excellent">Excellent</option></select></Field>
              <Field title="Fragrance strength"><select name="fragrance_strength" defaultValue={followup.fragrance_strength || ""} style={input}><option value="">Not discussed</option><option value="too_weak">Too weak</option><option value="good">Good</option><option value="too_strong">Too strong</option></select></Field>
              <Field title="Purchase interest"><select name="purchase_interest" defaultValue={followup.purchase_interest || ""} style={input}><option value="">Unknown</option><option value="ready_now">Ready to buy now</option><option value="maybe_later">Maybe later</option><option value="not_interested">Not interested</option></select></Field>
              <Field title="Preferred bottle size"><select name="preferred_bottle_size" defaultValue={followup.preferred_bottle_size || ""} style={input}><option value="">Unknown</option><option value="8ml">8ML</option><option value="50ml">50ML</option><option value="bundle">Bundle</option></select></Field>
            </div>
            <div style={{ marginTop: 16 }}><Field title="Customer's own feedback"><textarea name="customer_feedback" defaultValue={followup.customer_feedback || ""} rows={4} style={input} placeholder="Write what the customer said…" /></Field></div>
            <div style={{ marginTop: 16 }}><Field title="Internal notes"><textarea name="internal_notes" defaultValue={followup.internal_notes || ""} rows={3} style={input} placeholder="Notes visible only to your team…" /></Field></div>
            <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16 }}>
              <Field title="Override next action (optional)"><input name="next_action" defaultValue={followup.next_action || ""} style={input} placeholder="Otherwise selected automatically" /></Field>
              <Field title="Override resulting status (optional)"><select name="status" defaultValue="" style={input}><option value="">Choose automatically from outcome</option><option value="interested">Interested to buy</option><option value="call_later">Call later</option><option value="issue">Customer issue</option><option value="completed">Completed</option><option value="not_interested">Not interested</option></select></Field>
            </div>
            <button type="submit" style={{ ...button, marginTop: 18 }}>Save feedback and next action</button>
          </form>
        </section>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        <section style={card}>
          <h2 style={{ marginTop: 0 }}>Contact customer</h2>
          {(customer?.opt_out || customer?.blocked) && <div style={{ background: "#fee2e2", color: "#991b1b", padding: 10, borderRadius: 9, marginBottom: 12 }}>Customer is opted out or blocked. Do not send promotional WhatsApp messages.</div>}
          <div className="responsive-row" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}><a href={`tel:+${phone}`} style={{ ...button, background: "#166534", textDecoration: "none" }}>☎ Call {order?.customer_phone || customer?.phone}</a><Link href={`/inbox/${phone}`} style={{ ...button, background: "#2563eb", textDecoration: "none" }}>WhatsApp</Link></div>
          <h3>Log call result</h3>
          <form action="/api/follow-ups/attempt" method="POST" style={{ display: "grid", gap: 10 }}>
            <input type="hidden" name="id" value={id} /><input type="hidden" name="method" value="call" />
            <Field title="Result"><select name="result" required style={input}><option value="answered">Answered</option><option value="no_answer">Did not answer</option><option value="busy">Busy</option><option value="callback_requested">Requested callback</option></select></Field>
            <Field title="Try again at (used for unanswered/busy/callback)"><input type="datetime-local" name="next_attempt_at" defaultValue={nextDayInput()} style={input} /></Field>
            <Field title="Call notes"><textarea name="notes" rows={2} style={input} /></Field>
            <button type="submit" style={button}>Save call attempt</button>
          </form>
          <form action="/api/follow-ups/attempt" method="POST" style={{ marginTop: 10 }}><input type="hidden" name="id" value={id} /><input type="hidden" name="method" value="whatsapp" /><input type="hidden" name="result" value="message_sent" /><button type="submit" style={{ ...button, background: "white", color: "#2563eb", border: "1px solid #93c5fd" }}>Mark WhatsApp message sent</button></form>
        </section>

        <section style={card}>
          <h2 style={{ marginTop: 0 }}>Next action</h2>
          <div style={{ fontWeight: 700 }}>{followup.next_action || "Contact customer and collect feedback"}</div>
          <div style={{ color: "#756b5f", marginTop: 6 }}>{displayDate(followup.next_action_at || followup.due_at)}</div>
          <div style={{ color: "#756b5f", marginTop: 6 }}>{followup.attempt_count} contact attempt{followup.attempt_count === 1 ? "" : "s"}</div>
        </section>

        <section style={card}>
          <h2 style={{ marginTop: 0 }}>Contact history</h2>
          {(attempts || []).length === 0 && <p style={{ color: "#817669" }}>No attempts logged yet.</p>}
          {(attempts || []).map((attempt: any) => <div key={attempt.id} style={{ padding: "11px 0", borderBottom: "1px solid #eee5d8" }}><div style={{ fontWeight: 700 }}>{formatFollowupStatus(attempt.method)} · {formatFollowupStatus(attempt.result)}</div><div style={{ color: "#817669", fontSize: 12, marginTop: 3 }}>{displayDate(attempt.created_at)}{attempt.next_attempt_at ? ` · Next: ${displayDate(attempt.next_attempt_at)}` : ""}</div>{attempt.notes && <div style={{ marginTop: 5 }}>{attempt.notes}</div>}</div>)}
        </section>
      </div>
    </div>
  </main>;
}


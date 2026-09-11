import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

function dubaiDate(value: FormDataEntryValue | null, fallbackHours = 24) {
  const raw = String(value || "").trim();
  if (!raw) return new Date(Date.now() + fallbackHours * 60 * 60 * 1000).toISOString();
  const parsed = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(raw) ? raw : `${raw}:00+04:00`);
  return Number.isNaN(parsed.getTime()) ? new Date(Date.now() + fallbackHours * 60 * 60 * 1000).toISOString() : parsed.toISOString();
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const id = String(form.get("id") || "");
    const method = String(form.get("method") || "call");
    const result = String(form.get("result") || "");
    const notes = String(form.get("notes") || "").trim();
    if (!id || !["call", "whatsapp"].includes(method) || !["answered", "no_answer", "busy", "callback_requested", "message_sent"].includes(result)) {
      return NextResponse.json({ error: "Invalid follow-up attempt" }, { status: 400 });
    }
    const supabase = supabaseAdmin();
    const { data: followup, error: readError } = await supabase.from("customer_followups").select("attempt_count").eq("id", id).maybeSingle();
    if (readError || !followup) return NextResponse.json({ error: readError?.message || "Follow-up not found" }, { status: 404 });

    const count = (followup.attempt_count || 0) + 1;
    const needsRetry = ["no_answer", "busy", "callback_requested"].includes(result);
    const nextAttemptAt = needsRetry && count < 3 ? dubaiDate(form.get("next_attempt_at")) : null;
    const status = result === "message_sent" ? "awaiting_reply" : needsRetry ? (count >= 3 ? "no_response" : "call_later") : "in_progress";
    const nextAction = count >= 3 && needsRetry ? "Closed after three unanswered attempts" : result === "message_sent" ? "Wait for customer WhatsApp reply" : needsRetry ? "Try contacting the customer again" : "Enter the customer's feedback";

    const { error: attemptError } = await supabase.from("customer_followup_attempts").insert({ followup_id: id, method, result, notes: notes || null, next_attempt_at: nextAttemptAt });
    if (attemptError) return NextResponse.json({ error: attemptError.message }, { status: 500 });
    const { error } = await supabase.from("customer_followups").update({ attempt_count: count, status, next_action_at: nextAttemptAt, next_action: nextAction, completed_at: status === "no_response" ? new Date().toISOString() : null }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.redirect(new URL(`/follow-ups/${id}?saved=attempt`, req.url), 303);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Could not save attempt" }, { status: 500 });
  }
}


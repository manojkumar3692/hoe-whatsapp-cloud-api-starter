import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

const OUTCOME_DEFAULTS: Record<string, { status: string; action: string; delayDays?: number }> = {
  liked_all: { status: "interested", action: "Offer a bundle and ask the customer to rank their top choice" },
  favorite_selected: { status: "interested", action: "Send the selected perfume purchase link" },
  multiple_favorites: { status: "interested", action: "Recommend a bundle or multiple full bottles" },
  still_deciding: { status: "call_later", action: "Send usage tips and follow up after the customer tries them again", delayDays: 4 },
  none_liked: { status: "completed", action: "Close sales follow-up and retain the reason for product learning" },
  positive: { status: "completed", action: "Ask for a review and consider a future reorder reminder" },
  neutral: { status: "completed", action: "Record product-learning feedback; no immediate sales push" },
  negative: { status: "completed", action: "Record the reason and avoid an immediate sales offer" },
  product_issue: { status: "issue", action: "Resolve the product, packaging or delivery issue urgently" },
  safety_concern: { status: "issue", action: "Escalate safety concern and stop promotional follow-ups" },
  not_interested: { status: "not_interested", action: "No further sales follow-up for this purchase" },
};

function dateAfter(days: number) { return new Date(Date.now() + days * 86400000).toISOString(); }

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const id = String(form.get("id") || "");
    const outcome = String(form.get("feedback_outcome") || "");
    const ratingRaw = String(form.get("rating") || "");
    const rating = ratingRaw ? Number(ratingRaw) : null;
    if (!id || !outcome || (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5))) {
      return NextResponse.json({ error: "Follow-up, outcome and a valid rating are required" }, { status: 400 });
    }
    const recommendation = OUTCOME_DEFAULTS[outcome] || { status: "completed", action: "Feedback recorded" };
    const customAction = String(form.get("next_action") || "").trim();
    const status = String(form.get("status") || recommendation.status);
    const isClosed = ["completed", "no_response", "not_interested"].includes(status);
    const payload = {
      rating,
      feedback_outcome: outcome,
      favorite_perfumes: form.getAll("favorite_perfumes").map(String),
      longevity_feedback: String(form.get("longevity_feedback") || "") || null,
      fragrance_strength: String(form.get("fragrance_strength") || "") || null,
      purchase_interest: String(form.get("purchase_interest") || "") || null,
      preferred_bottle_size: String(form.get("preferred_bottle_size") || "") || null,
      customer_feedback: String(form.get("customer_feedback") || "").trim() || null,
      internal_notes: String(form.get("internal_notes") || "").trim() || null,
      status,
      next_action: customAction || recommendation.action,
      next_action_at: recommendation.delayDays ? dateAfter(recommendation.delayDays) : null,
      completed_at: isClosed ? new Date().toISOString() : null,
    };
    const supabase = supabaseAdmin();
    const { error } = await supabase.from("customer_followups").update(payload).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.redirect(new URL(`/follow-ups/${id}?saved=feedback`, req.url), 303);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Could not save feedback" }, { status: 500 });
  }
}


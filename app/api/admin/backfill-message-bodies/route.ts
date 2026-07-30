import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { describeInboundMessage } from "../../../../lib/messageContent";

// One-time cleanup: message_logs.body for inbound rows was computed at
// webhook time, before message types beyond "text" were parsed properly
// (see lib/messageContent.ts). Old rows still have their original
// "[TYPE message]" body text. raw_response was always stored in full
// though, so this just recomputes body from it — no data loss risk, and
// safe to run more than once (it's a no-op on rows already correct).
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    if (form.get("admin_password") !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = supabaseAdmin();

    const { data: rows, error } = await supabase
      .from("message_logs")
      .select("id, body, raw_response")
      .eq("direction", "inbound")
      .not("raw_response", "is", null)
      .limit(20000);

    if (error) {
      throw error;
    }

    let updated = 0;
    let skipped = 0;

    for (const row of rows || []) {
      let newBody: string;

      try {
        newBody = describeInboundMessage(row.raw_response);
      } catch {
        skipped++;
        continue;
      }

      if (!newBody || newBody === row.body) {
        continue;
      }

      const { error: updateError } = await supabase
        .from("message_logs")
        .update({ body: newBody })
        .eq("id", row.id);

      if (updateError) {
        skipped++;
      } else {
        updated++;
      }
    }

    return NextResponse.redirect(
      new URL(`/inbox?backfilled=${updated}&backfill_skipped=${skipped}`, req.url),
      303
    );
  } catch (e: any) {
    console.error("BACKFILL ERROR:", e);

    return NextResponse.json(
      { error: e.message || "Backfill failed" },
      { status: 500 }
    );
  }
}

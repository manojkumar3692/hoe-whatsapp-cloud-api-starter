import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { listMetaTemplates } from "../../../../lib/templates";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    if (form.get("admin_password") !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = supabaseAdmin();
    const metaTemplates = await listMetaTemplates();

    for (const t of metaTemplates) {
      await supabase
        .from("whatsapp_templates")
        .update({
          meta_template_id: t.id,
          status: t.status,
          category: t.category,
          rejected_reason: t.rejected_reason || null,
        })
        .eq("name", t.name)
        .eq("language", t.language);
    }

    return NextResponse.redirect(new URL(`/templates?synced=1`, req.url), 303);
  } catch (e: any) {
    console.error("TEMPLATE SYNC ERROR:", e);

    return NextResponse.json(
      { error: e.message || "Sync failed" },
      { status: 500 }
    );
  }
}

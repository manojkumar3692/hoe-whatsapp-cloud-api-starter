import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { sendTemplateMessage } from "../../../../lib/whatsapp";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    if (form.get("admin_password") !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const templateName = String(
      form.get("template_name") || process.env.META_DEFAULT_TEMPLATE || ""
    );

    const languageCode = String(form.get("language_code") || "en");
    const product = String(form.get("product") || "");
    const limit = Math.min(Number(form.get("limit") || 10), 500);

    if (!templateName) {
      return NextResponse.json(
        { error: "template_name required" },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    let q = supabase
      .from("customers")
      .select("*")
      .eq("consent", true)
      .limit(limit);

    if (product) {
      q = q.eq("product", product);
    }

    const { data: customers, error } = await q;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results = [];

    for (const c of customers || []) {
      const bodyParams = [
        String(form.get("body_param_1") || c.name || "there"),
      ];

      try {
        const wa = await sendTemplateMessage({
          to: c.phone,
          templateName,
          languageCode,
          bodyParams,
        });

        const wamid = wa.messages?.[0]?.id;

        await supabase.from("message_logs").insert({
          customer_id: c.id,
          phone: c.phone,
          direction: "outbound",
          template_name: templateName,
          body: bodyParams.join(", "),
          meta_message_id: wamid,
          status: wa.messages?.[0]?.message_status || "sent",
          raw_response: wa,
        });

        await supabase
          .from("customers")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", c.id);

        results.push({ phone: c.phone, ok: true, id: wamid });
      } catch (e: any) {
        await supabase.from("message_logs").insert({
          customer_id: c.id,
          phone: c.phone,
          direction: "outbound",
          template_name: templateName,
          body: bodyParams.join(", "),
          status: "failed",
          error: e.message,
          raw_response: { error: e.message },
        });

        results.push({
          phone: c.phone,
          ok: false,
          error: e.message,
        });
      }
    }

    return NextResponse.json({
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Campaign send failed" },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { normalizePhone } from "../../../../lib/phone";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    if (form.get("admin_password") !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaignName = String(form.get("campaign_name") || "Untitled Campaign");
    const templateName = String(form.get("template_name") || "");
    const languageCode = String(form.get("language_code") || "en");
    const couponCode = String(form.get("coupon_code") || "").trim();
    const headerImageUrl = String(form.get("header_image_url") || "").trim();
    const buttonUrlParam = String(form.get("button_url_param") || "").trim();
    const product = String(form.get("product") || "");
    const limit = Math.min(Number(form.get("limit") || 500), 500);

    const file = form.get("audience_file") as File | null;

    if (!templateName) {
      return NextResponse.json({ error: "Template name required" }, { status: 400 });
    }

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "Audience CSV required for preview" }, { status: 400 });
    }

    const text = await file.text();

    const rows = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });

    const parsed = rows
      .map((r: any) => ({
        name: r.name || r.Name || "Unknown",
        phone: normalizePhone(r.phone || r.Phone || r.whatsapp || r.WhatsApp || ""),
        product: r.product || r.Product || product || "",
        city: r.city || r.City || "",
      }))
      .filter((x: any) => x.phone);

    const unique = Array.from(
      new Map(parsed.map((x: any) => [x.phone, x])).values()
    ).slice(0, limit);

    if (unique.length === 0) {
      return NextResponse.json({ error: "No valid phone numbers found" }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        name: campaignName,
        template_name: templateName,
        product: product || null,
        coupon_code: couponCode || null,
        header_image_url: headerImageUrl || null,
        total_recipients: unique.length,
        status: "draft",
      })
      .select()
      .single();

    if (campaignError) {
      throw campaignError;
    }

    const phones = unique.map((x: any) => x.phone);

    const { data: existingCustomers } = await supabase
      .from("customers")
      .select("*")
      .in("phone", phones);

    const existingMap = new Map(
      (existingCustomers || []).map((c: any) => [c.phone, c])
    );

    const { data: alreadySentLogs } = await supabase
      .from("message_logs")
      .select("phone")
      .eq("template_name", templateName)
      .in("phone", phones);

    const alreadySentSet = new Set(
      (alreadySentLogs || []).map((x: any) => x.phone)
    );

    const recipients = unique.map((x: any) => {
      const existing = existingMap.get(x.phone);
      const alreadySent = alreadySentSet.has(x.phone);

      return {
        campaign_id: campaign.id,
        customer_id: existing?.id || null,
        name: x.name,
        phone: x.phone,
        product: x.product,
        city: x.city,
        status: alreadySent ? "already_sent" : "ready",
        reason: alreadySent ? "Already received this template before" : null,
      };
    });

    const { error: recipientError } = await supabase
      .from("campaign_recipients")
      .insert(recipients);

    if (recipientError) {
      throw recipientError;
    }

    return NextResponse.redirect(
      new URL(`/campaigns/preview/${campaign.id}`, req.url),
      303
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Preview failed" },
      { status: 500 }
    );
  }
}
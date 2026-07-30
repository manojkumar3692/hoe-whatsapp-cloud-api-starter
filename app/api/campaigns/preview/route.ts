import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { normalizePhone } from "../../../../lib/phone";

type AudienceCustomer = {
  name: string;
  phone: string;
  product: string;
  city: string;
};

function getHealth(customer: any) {
  const failCount = customer?.marketing_fail_count || 0;
  const cooldownUntil = customer?.marketing_cooldown_until;

  const inCooldown =
    cooldownUntil && new Date(cooldownUntil).getTime() > Date.now();

  if (inCooldown) {
    return {
      status: "cooldown",
      reason: `In cooldown until ${new Date(
        cooldownUntil
      ).toLocaleDateString()}`,
    };
  }

  if (failCount >= 2) {
    return {
      status: "warning",
      reason: `Warning: ${failCount} previous marketing failures`,
    };
  }

  return {
    status: "ready",
    reason: null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    if (form.get("admin_password") !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaignName = String(
      form.get("campaign_name") || "Untitled Campaign"
    );

    const templateName = String(form.get("template_name") || "");
    const couponCode = String(form.get("coupon_code") || "").trim();
    const headerImageUrl = String(form.get("header_image_url") || "").trim();
    const product = String(form.get("product") || "").trim();

    const requestedLimit = Number(form.get("limit") || 500);
    const limit = Math.min(
      Number.isFinite(requestedLimit) && requestedLimit > 0
        ? requestedLimit
        : 500,
      500
    );

    const file = form.get("audience_file") as File | null;

    if (!templateName) {
      return NextResponse.json(
        { error: "Template name required" },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    let unique: AudienceCustomer[] = [];

    if (file && file.size > 0) {
      // CSV audience mode
      const text = await file.text();

      const rows = parse(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });

      const parsed: AudienceCustomer[] = rows
        .map((r: any) => ({
          name: String(r.name || r.Name || "Unknown").trim(),
          phone: normalizePhone(
            r.phone || r.Phone || r.whatsapp || r.WhatsApp || ""
          ),
          product: String(r.product || r.Product || product || "").trim(),
          city: String(r.city || r.City || "").trim(),
        }))
        .filter((x: AudienceCustomer) => x.phone);

      unique = Array.from(
        new Map(
          parsed.map((customer: AudienceCustomer) => [
            customer.phone,
            customer,
          ])
        ).values()
      ).slice(0, limit);
    } else {
      // CRM customer database mode
      let customerQuery = supabase
        .from("customers")
        .select("name, phone, product, city")
        .eq("consent", true)
        .order("created_at", { ascending: true })
        .limit(limit);

      if (product) {
        customerQuery = customerQuery.eq("product", product);
      }

      const { data: crmCustomers, error: crmError } = await customerQuery;

      if (crmError) {
        throw crmError;
      }

      unique = (crmCustomers || [])
        .map((customer: any) => ({
          name: String(customer.name || "Unknown").trim(),
          phone: normalizePhone(customer.phone || ""),
          product: String(customer.product || "").trim(),
          city: String(customer.city || "").trim(),
        }))
        .filter((customer: AudienceCustomer) => customer.phone);
    }

    if (unique.length === 0) {
      return NextResponse.json(
        {
          error: file?.size
            ? "No valid phone numbers found in CSV"
            : "No eligible customers found in CRM for the selected filter",
        },
        { status: 400 }
      );
    }

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

    const phones = unique.map((customer) => customer.phone);

    const { data: existingCustomers, error: existingCustomersError } =
      await supabase.from("customers").select("*").in("phone", phones);

    if (existingCustomersError) {
      throw existingCustomersError;
    }

    const existingMap = new Map(
      (existingCustomers || []).map((customer: any) => [
        customer.phone,
        customer,
      ])
    );

    const { data: alreadySentLogs, error: alreadySentError } = await supabase
      .from("message_logs")
      .select("phone")
      .eq("template_name", templateName)
      .in("phone", phones);

    if (alreadySentError) {
      throw alreadySentError;
    }

    const alreadySentSet = new Set(
      (alreadySentLogs || []).map((log: any) => log.phone)
    );

    const recipients = unique.map((customer) => {
      const existing = existingMap.get(customer.phone);
      const alreadySent = alreadySentSet.has(customer.phone);
      const health = getHealth(existing);

      let status = health.status;
      let reason = health.reason;

      if (alreadySent) {
        status = "already_sent";
        reason = "Already received this template before";
      }

      return {
        campaign_id: campaign.id,
        customer_id: existing?.id || null,
        name: customer.name,
        phone: customer.phone,
        product: customer.product,
        city: customer.city,
        status,
        reason,
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
    console.error("CAMPAIGN PREVIEW ERROR:", e);

    return NextResponse.json(
      {
        error: e.message || "Preview failed",
      },
      { status: 500 }
    );
  }
}
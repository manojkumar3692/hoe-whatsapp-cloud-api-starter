import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { sendTemplateMessage } from "../../../../lib/whatsapp";

function getBodyParams(customerName: string) {
  return [customerName || "there"];
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    if (form.get("admin_password") !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaignId = String(form.get("campaign_id") || "");

    if (!campaignId) {
      return NextResponse.json(
        { error: "campaign_id required. Please preview campaign first." },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .maybeSingle();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: campaignError?.message || "Campaign not found" },
        { status: 404 }
      );
    }

    if (campaign.status === "completed") {
      return NextResponse.json(
        { error: "This campaign is already completed. Create a new preview to resend." },
        { status: 400 }
      );
    }

    const { data: recipients, error: recipientsError } = await supabase
      .from("campaign_recipients")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("status", "ready")
      .order("created_at", { ascending: true });

    if (recipientsError) {
      return NextResponse.json({ error: recipientsError.message }, { status: 500 });
    }

    if (!recipients || recipients.length === 0) {
      return NextResponse.json(
        { error: "No ready recipients found for this campaign." },
        { status: 400 }
      );
    }

    await supabase
      .from("campaigns")
      .update({
        status: "sending",
        total_recipients: recipients.length,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaignId);

    const results = [];

    for (const r of recipients) {
      const customerPayload = {
        name: r.name || "Unknown",
        phone: r.phone,
        product: r.product || "",
        city: r.city || "",
        source: "campaign_csv",
        consent: true,
        last_campaign_name: campaign.name,
        last_campaign_at: new Date().toISOString(),
      };

      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .upsert(customerPayload, { onConflict: "phone" })
        .select("*")
        .single();

      if (customerError) {
        await supabase
          .from("campaign_recipients")
          .update({
            status: "failed",
            reason: customerError.message,
          })
          .eq("id", r.id);

        results.push({
          phone: r.phone,
          ok: false,
          error: customerError.message,
        });

        continue;
      }

      const bodyParams = getBodyParams(customer?.name || r.name);

      try {
        const wa = await sendTemplateMessage({
          to: r.phone,
          templateName: campaign.template_name,
          languageCode: "en",
          bodyParams,
          headerImageUrl: campaign.header_image_url || "",
          buttonUrlParam: "",
        });

        const wamid = wa.messages?.[0]?.id;
        const status = wa.messages?.[0]?.message_status || "accepted";

        await supabase.from("message_logs").insert({
          campaign_id: campaignId,
          customer_id: customer?.id || null,
          phone: r.phone,
          direction: "outbound",
          template_name: campaign.template_name,
          body: bodyParams.join(", "),
          meta_message_id: wamid,
          status,
          raw_response: wa,
        });

        await supabase
          .from("customers")
          .update({
            last_message_at: new Date().toISOString(),
            last_campaign_name: campaign.name,
            last_campaign_at: new Date().toISOString(),
          })
          .eq("id", customer.id);

        await supabase
          .from("campaign_recipients")
          .update({
            customer_id: customer.id,
            status: "sent",
            reason: null,
          })
          .eq("id", r.id);

        results.push({ phone: r.phone, ok: true, id: wamid });

        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (e: any) {
        await supabase.from("message_logs").insert({
          campaign_id: campaignId,
          customer_id: customer?.id || null,
          phone: r.phone,
          direction: "outbound",
          template_name: campaign.template_name,
          body: bodyParams.join(", "),
          status: "failed",
          error: e.message,
          raw_response: { error: e.message },
        });

        await supabase
          .from("campaign_recipients")
          .update({
            customer_id: customer?.id || null,
            status: "failed",
            reason: e.message,
          })
          .eq("id", r.id);

        results.push({
          phone: r.phone,
          ok: false,
          error: e.message,
        });
      }
    }

    const sentCount = results.filter((r) => r.ok).length;
    const failedCount = results.filter((r) => !r.ok).length;

    await supabase
      .from("campaigns")
      .update({
        sent_count: sentCount,
        failed_count: failedCount,
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaignId);

    return NextResponse.json({
      campaignId,
      campaignName: campaign.name,
      templateName: campaign.template_name,
      total: results.length,
      sent: sentCount,
      failed: failedCount,
      results,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Campaign send failed" },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

function getFailReason(status: any) {
  const err = status.errors?.[0];

  if (!err) return null;

  return {
    code: err.code,
    title: err.title || err.message || "Unknown failure",
    details: err.error_data?.details || err.message || "",
  };
}

function shouldIncreaseFailCount(code?: number) {
  return [131049, 131026].includes(Number(code));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = supabaseAdmin();

    const entries = body.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];

      for (const change of changes) {
        const value = change.value;

        const messages = value.messages || [];

        for (const msg of messages) {
          const phone = msg.from;
          const messageId = msg.id;

          let textBody = "";

          if (msg.type === "text") {
            textBody = msg.text?.body || "";
          } else if (msg.type) {
            textBody = `[${msg.type} message]`;
          }

          const { data: existingCustomer } = await supabase
            .from("customers")
            .select("*")
            .eq("phone", phone)
            .maybeSingle();

          let customerId = existingCustomer?.id;

          if (!customerId) {
            const { data: newCustomer } = await supabase
              .from("customers")
              .insert({
                name: "Unknown",
                phone,
                source: "whatsapp",
                consent: true,
              })
              .select()
              .single();

            customerId = newCustomer?.id;
          }

          await supabase.from("message_logs").insert({
            customer_id: customerId,
            phone,
            direction: "inbound",
            status: "received",
            body: textBody,
            meta_message_id: messageId,
            raw_response: msg,
          });
        }

        const statuses = value.statuses || [];

        for (const status of statuses) {
          const failReason = getFailReason(status);

          await supabase
            .from("message_logs")
            .update({
              status: status.status,
              raw_response: status,
              error: failReason
                ? `${failReason.code}: ${failReason.title}`
                : null,
            })
            .eq("meta_message_id", status.id);

          const { data: log } = await supabase
            .from("message_logs")
            .select("id, phone, customer_id, direction")
            .eq("meta_message_id", status.id)
            .maybeSingle();

          if (!log?.phone) continue;

          if (["delivered", "read"].includes(status.status)) {
            await supabase
              .from("customers")
              .update({
                marketing_fail_count: 0,
                last_marketing_fail_reason: null,
                last_marketing_fail_at: null,
                marketing_cooldown_until: null,
              })
              .eq("phone", log.phone);
          }

          if (status.status === "failed" && failReason) {
            const { data: customer } = await supabase
              .from("customers")
              .select("marketing_fail_count")
              .eq("phone", log.phone)
              .maybeSingle();

            const currentFailCount = customer?.marketing_fail_count || 0;
            const newFailCount = shouldIncreaseFailCount(failReason.code)
              ? currentFailCount + 1
              : currentFailCount;

            const cooldownUntil =
              newFailCount >= 3
                ? new Date(
                    Date.now() + 30 * 24 * 60 * 60 * 1000
                  ).toISOString()
                : null;

            await supabase
              .from("customers")
              .update({
                marketing_fail_count: newFailCount,
                last_marketing_fail_reason: `${failReason.code}: ${failReason.title}`,
                last_marketing_fail_at: new Date().toISOString(),
                marketing_cooldown_until: cooldownUntil,
              })
              .eq("phone", log.phone);
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("WEBHOOK ERROR:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
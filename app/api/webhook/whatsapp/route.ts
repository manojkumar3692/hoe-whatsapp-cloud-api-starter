import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

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
    console.log("WEBHOOK BODY:", JSON.stringify(body, null, 2));
    const supabase = supabaseAdmin();

    const entries = body.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];

      for (const change of changes) {
        const value = change.value;

        // Incoming customer messages
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

        // Delivery/read/failed status updates
        const statuses = value.statuses || [];

        for (const status of statuses) {
          await supabase
            .from("message_logs")
            .update({
              status: status.status,
              raw_response: status,
            })
            .eq("meta_message_id", status.id);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("WEBHOOK ERROR:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
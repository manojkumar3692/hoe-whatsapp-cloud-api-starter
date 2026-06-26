import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { sendTextMessage } from "../../../../lib/whatsapp";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    if (form.get("admin_password") !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const phone = String(form.get("phone") || "");
    const message = String(form.get("message") || "").trim();

    if (!phone || !message) {
      return NextResponse.json(
        { error: "Phone and message required" },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: lastInbound } = await supabase
      .from("message_logs")
      .select("*")
      .eq("phone", phone)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastInbound) {
      return NextResponse.json(
        { error: "No inbound customer message found. Send a template first." },
        { status: 400 }
      );
    }

    const lastInboundTime = new Date(lastInbound.created_at).getTime();
    const now = Date.now();
    const hoursDiff = (now - lastInboundTime) / (1000 * 60 * 60);

    if (hoursDiff > 24) {
      return NextResponse.json(
        {
          error:
            "24-hour service window expired. Use an approved template instead.",
        },
        { status: 400 }
      );
    }

    const wa = await sendTextMessage({
      to: phone,
      message,
    });

    const wamid = wa.messages?.[0]?.id;

    const { data: customer } = await supabase
      .from("customers")
      .select("*")
      .eq("phone", phone)
      .maybeSingle();

    await supabase.from("message_logs").insert({
      customer_id: customer?.id || null,
      phone,
      direction: "outbound",
      status: wa.messages?.[0]?.message_status || "accepted",
      body: message,
      meta_message_id: wamid,
      raw_response: wa,
    });

    return NextResponse.redirect(new URL(`/inbox/${phone}`, req.url), 303);
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Reply failed" },
      { status: 500 }
    );
  }
}
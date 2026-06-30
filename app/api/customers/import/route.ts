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

    const file = form.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    const text = await file.text();

    const rows = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });

    const payload = rows
      .map((r: any) => ({
        name: r.name || r.Name || "Unknown",
        phone: normalizePhone(
          r.phone || r.Phone || r.whatsapp || r.WhatsApp || ""
        ),
        product: r.product || r.Product || "",
        city: r.city || r.City || "",
        last_order_date: r.last_order_date || r.order_date || null,
        consent: true,
      }))
      .filter((r: any) => r.phone);

    if (payload.length === 0) {
      return NextResponse.json(
        { error: "No valid customers found in CSV" },
        { status: 400 }
      );
    }

    const uniquePayload = Array.from(
      new Map(payload.map((customer: any) => [customer.phone, customer])).values()
    );

    const duplicateCount = payload.length - uniquePayload.length;

    const supabase = supabaseAdmin();

    const { error } = await supabase
      .from("customers")
      .upsert(uniquePayload, { onConflict: "phone" });

    if (error) {
      throw error;
    }

    return NextResponse.redirect(
      new URL(
        `/customers?imported=${uniquePayload.length}&duplicates=${duplicateCount}`,
        req.url
      ),
      303
    );
  } catch (e: any) {
    console.error("IMPORT ERROR:", e);

    return NextResponse.json(
      { error: e.message || "Import failed" },
      { status: 500 }
    );
  }
}
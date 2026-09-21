import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";
import { renderInvoice } from "../../../../../lib/invoice";
export const runtime = "nodejs";
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: order, error } = await supabaseAdmin().from("orders").select("*").eq("id", id).maybeSingle();
  if (error || !order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const pdf = await renderInvoice(order);
  const filename = String(order.order_number).replace(/[^a-zA-Z0-9_-]/g, "_");
  return new NextResponse(new Uint8Array(pdf), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="invoice-${filename}.pdf"`,
    "Cache-Control": "private, no-store",
  } });
}

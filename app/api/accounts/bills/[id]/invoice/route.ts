import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../../lib/supabaseAdmin";
import { financeAccess, validId } from "../../../../../../lib/financeRequest";
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await financeAccess(req); if (denied) return denied;
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ error: "Invalid bill." }, { status: 400 });
  const db = supabaseAdmin(), { data: bill, error } = await db.from("finance_bills").select("document_path").eq("id", id).maybeSingle();
  if (error || !bill?.document_path) return NextResponse.json({ error: "Invoice attachment not found." }, { status: 404 });
  const { data, error: downloadError } = await db.storage.from("accounting-documents").download(bill.document_path);
  if (downloadError || !data) return NextResponse.json({ error: "Could not download invoice." }, { status: 500 });
  const ext = bill.document_path.split(".").pop();
  return new NextResponse(await data.arrayBuffer(), { headers: { "Content-Type": data.type, "Content-Disposition": `attachment; filename="supplier-invoice-${id}.${ext}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

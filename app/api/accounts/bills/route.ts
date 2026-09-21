import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { validateBill } from "../../../../lib/finance";
import { financeAccess, financeError, validId } from "../../../../lib/financeRequest";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const denied = await financeAccess(req, true); if (denied) return denied;
  let bill, id: string, expected: number, file: File | null;
  try {
    if (Number(req.headers.get("content-length") || 0) > 6 * 1024 * 1024) throw new Error("Invoice upload must be at most 5 MB.");
    const form = await req.formData(), raw = JSON.parse(String(form.get("bill") || "{}"));
    if (!validId(raw.id)) throw new Error("Invalid bill identifier.");
    id = raw.id; expected = Number(raw.version ?? 0);
    if (!Number.isSafeInteger(expected) || expected < 0) throw new Error("Invalid bill version.");
    bill = validateBill(raw);
    const attached = form.get("invoice"); file = attached instanceof File && attached.size ? attached : null;
    if (file && file.size > 5 * 1024 * 1024) throw new Error("Invoice upload must be at most 5 MB.");
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid purchase." }, { status: 400 }); }
  const db = supabaseAdmin();
  let document_path: string | null = null;
  if (file) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = bytes.subarray(0, 5).toString() === "%PDF-" ? "application/pdf" : bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png" : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg" : null;
    if (!mime) return NextResponse.json({ error: "Attach a PDF, PNG or JPEG invoice." }, { status: 400 });
    document_path = `${id}/${randomUUID()}.${mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg"}`;
    const { error } = await db.storage.from("accounting-documents").upload(document_path, bytes, { contentType: mime, upsert: false });
    if (error) return NextResponse.json({ error: "Invoice upload failed. Ensure private invoice storage is set up, then retry." }, { status: 503 });
  }
  const { error } = await db.rpc("finance_save_bill", { p_id: id, p_expected_version: expected, p_bill: { ...bill, document_path } });
  if (error) {
    if (document_path) await db.storage.from("accounting-documents").remove([document_path]);
    return financeError(error);
  }
  return NextResponse.json({ id });
}

import { NextRequest, NextResponse } from "next/server";
import { monthBounds, validMonth, summarize, reviewReasons } from "../../../../lib/accounting";
import { loadAccountOrders } from "../../../../lib/accountsQuery";
import { accountsRegister } from "../../../../lib/accountsExport";
import { renderInvoice } from "../../../../lib/invoice";
import { createZip } from "../../../../lib/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Session-protected by middleware, like the existing order export.
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") || "";
  const format = req.nextUrl.searchParams.get("format") || "zip";
  if (!validMonth(month) || !["zip", "csv"].includes(format)) return NextResponse.json({ error: "Choose a valid month and export format." }, { status: 400 });
  try {
    const { from, to } = monthBounds(month);
    const orders = await loadAccountOrders(from, to, format === "zip");
    const headers = { "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="accounts-${month}.${format}"` };
    const register = accountsRegister(orders);
    if (format === "csv") return new NextResponse(register, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
    if (!orders.length) return NextResponse.json({ error: "No paid invoices exist for this month." }, { status: 404 });
    const entries: { name: string; data: Buffer }[] = [{ name: "sales-gst-register.csv", data: Buffer.from(register) }];
    let size = entries[0].data.length;
    for (const order of orders) {
      const data = await renderInvoice(order);
      size += data.length;
      if (size > 100 * 1024 * 1024 || entries.length >= 65000) return NextResponse.json({ error: "This invoice pack is too large for an online download. Download the register and contact your administrator to arrange the full archive." }, { status: 413 });
      const safeName = `${order.order_number}-${order.id}`.replace(/[^a-zA-Z0-9_-]/g, "_");
      entries.push({ name: `invoices/${safeName}.pdf`, data });
    }
    entries.push({ name: "summary.json", data: Buffer.from(JSON.stringify({ month, generatedAt: new Date().toISOString(), currency: "INR", amountUnit: "paise", ...summarize(orders) }, null, 2)) });
    entries.push({ name: "review.json", data: Buffer.from(JSON.stringify(orders.filter(o => reviewReasons(o).length).map(o => ({ invoice: o.order_number, orderId: o.id, reasons: reviewReasons(o) })), null, 2)) });
    entries.push({ name: "READ-ME.txt", data: Buffer.from(`HOUSE OF EON | Accounts pack | ${month}\n\nContains all non-hidden orders marked paid with payment type full or partial_cod, by order creation date in Asia/Kolkata.\nEach PDF uses the same renderer as the individual order invoice.\nAmounts in the register are INR; amounts in summary.json are integer paise.\nGST follows the existing invoice model (18% inclusive). Unknown states have an unresolved GST split.\nPaid returns/cancellations remain included in gross totals and are flagged for credit-note review; no automatic tax reversal is made.\nCOD collection is recorded/assumed from order status, not verified bank settlement.\nThis is a working sales register, not a GST portal upload or filed return. Final tax payable requires verified rates, input credits, credit notes and other adjustments.\nInvoices are generated from current order data and are not immutable historical snapshots.\n`) });
    return new NextResponse(new Uint8Array(createZip(entries)), { headers: { ...headers, "Content-Type": "application/zip" } });
  } catch {
    return NextResponse.json({ error: "Could not create the accounts export. Please try again. No partial archive was issued." }, { status: 500 });
  }
}

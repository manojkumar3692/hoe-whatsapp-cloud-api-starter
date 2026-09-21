import { NextRequest, NextResponse } from "next/server";
import { loadFinance } from "../../../../lib/financeData";
import { financeAccess } from "../../../../lib/financeRequest";
import { validMonth } from "../../../../lib/accounting";
import { createZip } from "../../../../lib/zip";
import { BILL_CATEGORIES } from "../../../../lib/finance";
function csv(rows: (string | number)[][]) {
  return Buffer.from("\uFEFF" + rows.map(row => row.map(value => {
    const text = typeof value === "string" && /^[\s]*[=+@-]/.test(value) ? `'${value}` : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n"));
}
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const denied = await financeAccess(req); if (denied) return denied;
  const month = req.nextUrl.searchParams.get("month") || "";
  if (!validMonth(month)) return NextResponse.json({ error: "Invalid month." }, { status: 400 });
  const data = await loadFinance(month);
  if (!data.ready) return NextResponse.json({ error: data.message }, { status: 503 });
  const bills = data.bills.filter(b => !b.voided && b.invoice_date.startsWith(month));
  const payments = data.payments.filter(p => p.paid_on.startsWith(month));
  const entries = [
    { name: "supplier-bills.csv", data: csv([["Supplier", "GSTIN", "Invoice", "Invoice date", "Due date", "Expense month", "Category", "Base INR", "CGST INR", "SGST INR", "IGST INR", "Total INR", "ITC status", "Credit review", "Recorded paid INR", "Outstanding INR"], ...bills.map(b => { const paid = data.payments.filter(p => p.bill_id === b.id).reduce((n, p) => n + p.amount_paise, 0); return [b.supplier, b.supplier_gstin || "", b.invoice_number, b.invoice_date, b.due_date || "", b.service_month, BILL_CATEGORIES[b.category], ...[b.subtotal_paise, b.cgst_paise, b.sgst_paise, b.igst_paise, b.total_paise].map(n => (n / 100).toFixed(2)), b.itc_status, b.itc_note, (paid / 100).toFixed(2), ((b.total_paise - paid) / 100).toFixed(2)]; })]) },
    { name: "supplier-payments.csv", data: csv([["Supplier", "Invoice", "Paid on", "Amount INR", "Reference"], ...payments.map(p => { const b = data.bills.find(b => b.id === p.bill_id); return [b?.supplier || "", b?.invoice_number || "", p.paid_on, (p.amount_paise / 100).toFixed(2), p.reference]; })]) },
    { name: "meta-spend.csv", data: csv([["Date", "Campaign", "Spend INR", "Clicks", "Impressions", "Meta purchases"], ...data.daily.map(d => [d.day, d.campaign_name, (d.spend_paise / 100).toFixed(2), d.clicks, d.impressions, d.purchases])]) },
    { name: "READ-ME.txt", data: Buffer.from(`Finance working registers for ${month}.\nBill register is by invoice date; payments are by actual payment date. Outstanding balances are current, not historical snapshots. Expense month is used for profit estimates.\nMeta spend is advertising delivery cost, not a tax invoice or bank payment. Meta supplier invoice base amounts must not be added to synced spend.\nMeta report status: ${data.syncs.find(s => s.month === month) ? JSON.stringify(data.syncs.find(s => s.month === month)) : "NOT SYNCED - no spend assertion"}.\nInvoice attachments are available privately from each bill in Accounts.\nGST credit eligibility is accounts-reviewed and does not itself file a tax return.\n`) },
  ];
  return new NextResponse(new Uint8Array(createZip(entries)), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="finance-registers-${month}.zip"`, "Cache-Control": "private, no-store" } });
}

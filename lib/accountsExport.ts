import { AccountOrder, dateKey, gstSplit, reviewReasons, summarize } from "./accounting";

function csvCell(value: string | number) {
  // Prevent spreadsheet formula evaluation of customer-entered text.
  const text = typeof value === "string" && /^[\s]*[=+@\-]/.test(value) ? `'${value}` : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}
export function accountsRegister(orders: AccountOrder[]) {
  const rows: (string | number)[][] = [["Invoice number", "Invoice date (IST)", "Customer", "Place of supply", "Payment type", "Invoice total INR", "Taxable INR", "Output GST INR", "CGST INR", "SGST INR", "IGST INR", "GST split unresolved INR", "Online recorded INR", "COD recorded collected INR", "COD outstanding INR", "COD under review INR", "Fulfillment", "Review"]];
  for (const order of orders) {
    const tax = gstSplit(order.amount_in_paise, order.customer_state), totals = summarize([order]);
    rows.push([order.order_number, dateKey(order.created_at), order.customer_name, order.customer_state || "", order.payment_type,
      ...[order.amount_in_paise, tax.taxable, tax.gst, tax.cgst, tax.sgst, tax.igst, tax.unallocated, totals.online, totals.codCollected, totals.codPending, totals.codReview].map(n => (n / 100).toFixed(2)),
      order.shipping_status, reviewReasons(order).join("; ")]);
  }
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n");
}

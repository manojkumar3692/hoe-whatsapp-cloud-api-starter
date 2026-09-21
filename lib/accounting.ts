// Accounts use the seller's Indian calendar and integer paise throughout.
export const ACCOUNTS_TIMEZONE = "Asia/Kolkata";
const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: ACCOUNTS_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });
export type AccountOrder = {
  id: string; order_number: string; created_at: string; customer_name: string;
  customer_state: string | null; amount_in_paise: number; payment_status: string;
  payment_type: string; token_amount_in_paise: number; balance_due_in_paise: number;
  cod_balance_status: string; shipping_status: string; is_hidden?: boolean; items?: unknown;
};
export function dateKey(date: string | Date) {
  return dateFormatter.format(new Date(date));
}
export function validMonth(month: string) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && Number(month.slice(0, 4)) >= 2000 && Number(month.slice(0, 4)) <= 2100; }
export function shiftMonth(month: string, offset: number) {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1 + offset, 1)).toISOString().slice(0, 7);
}
export function monthBounds(month: string) {
  if (!validMonth(month)) throw new Error("Choose a valid month (YYYY-MM).");
  return { from: `${month}-01T00:00:00+05:30`, to: `${shiftMonth(month, 1)}-01T00:00:00+05:30` };
}
export function weekStart(now: Date) {
  const day = new Date(`${dateKey(now)}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return day.toISOString().slice(0, 10);
}
export function isPaidOrder(order: AccountOrder) {
  return order.payment_status === "paid" && !order.is_hidden && ["full", "partial_cod"].includes(order.payment_type);
}
export function codNeedsReview(order: AccountOrder) {
  return ["cancelled", "returned", "refunded", "rejected", "return_requested", "delivery_disputed"].includes(order.shipping_status);
}
const states = new Set(["andaman and nicobar islands", "andhra pradesh", "arunachal pradesh", "assam", "bihar", "chandigarh", "chhattisgarh", "dadra and nagar haveli and daman and diu", "delhi", "goa", "gujarat", "haryana", "himachal pradesh", "jammu and kashmir", "jharkhand", "karnataka", "kerala", "ladakh", "lakshadweep", "madhya pradesh", "maharashtra", "manipur", "meghalaya", "mizoram", "nagaland", "odisha", "puducherry", "punjab", "rajasthan", "sikkim", "tamil nadu", "telangana", "tripura", "uttar pradesh", "uttarakhand", "west bengal"]);
export function gstSplit(amount: number, state: string | null) {
  const normalized = (state || "").trim().toLowerCase();
  const intraState = ["tn", "tamilnadu", "tamil nadu"].includes(normalized);
  const knownState = intraState || states.has(normalized);
  const taxable = Math.round(amount / 1.18); // Existing invoice model: 18% inclusive.
  const gst = amount - taxable;
  const cgst = intraState ? Math.round(gst / 2) : 0;
  const sgst = intraState ? gst - cgst : 0;
  return { taxable, gst, cgst, sgst, igst: knownState && !intraState ? gst : 0, unallocated: knownState ? 0 : gst, knownState, intraState };
}
export function reviewReasons(order: AccountOrder) {
  const reasons: string[] = [];
  if (!gstSplit(order.amount_in_paise, order.customer_state).knownState) reasons.push("Verify place of supply");
  if (codNeedsReview(order)) reasons.push("Review return / credit note");
  if (!Number.isSafeInteger(order.amount_in_paise) || order.amount_in_paise <= 0) reasons.push("Verify invoice amount");
  if (order.payment_type === "partial_cod" && (order.token_amount_in_paise + order.balance_due_in_paise !== order.amount_in_paise || !["pending", "collected"].includes(order.cod_balance_status))) reasons.push("Reconcile COD split");
  return reasons;
}
export function summarize(orders: AccountOrder[]) {
  const total = { count: 0, sales: 0, taxable: 0, gst: 0, cgst: 0, sgst: 0, igst: 0, unallocated: 0, online: 0, codCollected: 0, codPending: 0, codReview: 0, fullSales: 0, codSales: 0, review: 0 };
  for (const order of orders.filter(isPaidOrder)) {
    const tax = gstSplit(order.amount_in_paise, order.customer_state);
    total.count++; total.sales += order.amount_in_paise;
    for (const key of ["taxable", "gst", "cgst", "sgst", "igst", "unallocated"] as const) total[key] += tax[key];
    if (order.payment_type === "full") { total.fullSales += order.amount_in_paise; total.online += order.amount_in_paise; }
    else {
      total.codSales += order.amount_in_paise;
      total.online += order.token_amount_in_paise;
      if (order.cod_balance_status === "collected") total.codCollected += order.balance_due_in_paise;
      else if (codNeedsReview(order)) total.codReview += order.balance_due_in_paise;
      else total.codPending += order.balance_due_in_paise;
    }
    if (reviewReasons(order).length) total.review++;
  }
  return total;
}
export function money(paise: number) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(paise / 100); }
export function monthLabel(month: string) { return new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: ACCOUNTS_TIMEZONE }); }

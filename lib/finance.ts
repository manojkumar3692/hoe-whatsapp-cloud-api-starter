import { AccountOrder, codNeedsReview, dateKey, gstSplit, isPaidOrder } from "./accounting";
import { parseCartItems } from "./cartItems";

export const BILL_CATEGORIES = { materials: "Materials & packaging", meta_ads: "Meta advertising", advertising: "Other advertising", shipping: "Courier & shipping", payment_fees: "Payment fees", rent: "Rent", other: "Other expenses" } as const;
export type BillCategory = keyof typeof BILL_CATEGORIES;
export type BillItem = { description: string; quantity_milli: number; unit: string; unit_cost_paise: number };
export type Bill = { id: string; supplier: string; supplier_gstin: string | null; invoice_number: string; invoice_date: string; due_date: string | null; service_month: string; category: BillCategory; items: BillItem[]; subtotal_paise: number; cgst_paise: number; sgst_paise: number; igst_paise: number; total_paise: number; itc_status: "pending" | "eligible" | "ineligible"; itc_note: string; notes: string; document_path: string | null; version: number; voided: boolean; created_at: string };
export type BillPayment = { id: string; bill_id: string; paid_on: string; amount_paise: number; reference: string };
export type Sku = { id: string; sku: string; product_key: string; product_name: string; size: string };
export type CostComponent = { description: string; quantity_milli: number; unit: string; unit_cost_paise: number };
export type ProductCost = { id: string; sku_id: string; effective_from: string; components: CostComponent[]; unit_cost_paise: number; notes: string };
export type MetaDaily = { account_id: string; campaign_id: string; campaign_name: string; day: string; spend_paise: number; impressions: number; clicks: number; purchases: number; purchase_value_paise: number };
export type MetaCampaign = { account_id: string; campaign_id: string; name: string; effective_status: string; daily_budget_paise: number | null; lifetime_budget_paise: number | null; objective: string };
export type MetaSync = { account_id: string; month: string; through_date: string; synced_at: string; account_name: string; currency: string; timezone: string };
export function validDate(value: unknown): value is string {
  return typeof value === "string" && /^20\d{2}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function decimalUnits(value: unknown, decimals: number, label: string): number {
  const text = String(value ?? "").trim();
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(text)) throw new Error(`${label} must be a non-negative number with at most ${decimals} decimals.`);
  const [whole, fraction = ""] = text.split(".");
  const result = Number(whole) * 10 ** decimals + Number(fraction.padEnd(decimals, "0"));
  if (!Number.isSafeInteger(result) || result > 100_000_000_000) throw new Error(`${label} is too large.`);
  return result;
}
export function textField(value: unknown, label: string, max = 200, required = true) {
  const text = typeof value === "string" ? value.trim() : "";
  if ((required && !text) || text.length > max) throw new Error(`${label} is required and must be at most ${max} characters.`);
  return text;
}
export function parseItems(raw: unknown): BillItem[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 100) throw new Error("Add between 1 and 100 line items.");
  return raw.map(item => {
    if (!item || typeof item !== "object") throw new Error("Invalid line item.");
    const quantity_milli = decimalUnits(item.quantity, 3, "Quantity");
    if (!quantity_milli || quantity_milli > 1_000_000_000) throw new Error("Quantity must be positive and no more than 1,000,000.");
    return { description: textField(item.description, "Description"), unit: textField(item.unit, "Unit", 30), quantity_milli, unit_cost_paise: decimalUnits(item.unit_cost, 2, "Unit cost") };
  });
}
export function itemTotal(items: BillItem[]) {
  let total = 0;
  for (const item of items) {
    const product = item.quantity_milli * item.unit_cost_paise;
    if (!Number.isSafeInteger(product)) throw new Error("Line item amount is too large.");
    total += Math.round(product / 1000);
  }
  if (!Number.isSafeInteger(total) || total > 100_000_000_000) throw new Error("Total is too large.");
  return total;
}
export function validateBill(raw: Record<string, unknown>) {
  const supplier = textField(raw.supplier, "Supplier"), invoice_number = textField(raw.invoice_number, "Invoice number", 100);
  if (!validDate(raw.invoice_date) || (raw.due_date && !validDate(raw.due_date))) throw new Error("Enter valid invoice and due dates.");
  if (raw.due_date && String(raw.due_date) < raw.invoice_date) throw new Error("Due date cannot precede invoice date.");
  if (!Object.hasOwn(BILL_CATEGORIES, String(raw.category))) throw new Error("Choose a purchase category.");
  const category = raw.category as BillCategory;
  const service_month = String(raw.service_month || raw.invoice_date.slice(0, 7));
  if (!validDate(`${service_month}-01`)) throw new Error("Choose a valid expense month.");
  const supplier_gstin = textField(raw.supplier_gstin, "Supplier GSTIN", 15, false).toUpperCase();
  if (supplier_gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(supplier_gstin)) throw new Error("Supplier GSTIN must be a valid 15-character format.");
  const items = parseItems(raw.items), subtotal_paise = itemTotal(items);
  const cgst_paise = decimalUnits(raw.cgst || "0", 2, "CGST"), sgst_paise = decimalUnits(raw.sgst || "0", 2, "SGST"), igst_paise = decimalUnits(raw.igst || "0", 2, "IGST");
  if (igst_paise && (cgst_paise || sgst_paise)) throw new Error("Use IGST or CGST/SGST, not both.");
  const total_paise = subtotal_paise + cgst_paise + sgst_paise + igst_paise;
  if (total_paise <= 0 || total_paise > 100_000_000_000) throw new Error("Invoice total must be positive and within the supported range.");
  const itc_status = String(raw.itc_status || "pending");
  if (!["pending", "eligible", "ineligible"].includes(itc_status)) throw new Error("Choose an input-credit status.");
  const itc_note = textField(raw.itc_note, "Credit review note", 1000, false);
  if (itc_status === "eligible" && (!supplier_gstin || itc_note.length < 5)) throw new Error("Eligible credit requires supplier GSTIN and a reconciliation note.");
  return { supplier, invoice_number, invoice_date: raw.invoice_date, due_date: raw.due_date || null, service_month, category, supplier_gstin: supplier_gstin || null, items, subtotal_paise, cgst_paise, sgst_paise, igst_paise, total_paise, itc_status, itc_note, notes: textField(raw.notes, "Notes", 2000, false) };
}
export function billTax(bill: Bill) { return bill.cgst_paise + bill.sgst_paise + bill.igst_paise; }
export function expenseCost(bill: Bill) { return bill.subtotal_paise + (bill.itc_status === "eligible" ? 0 : billTax(bill)); }
export function summarizeBills(bills: Bill[], payments: BillPayment[], month: string) {
  const active = bills.filter(b => !b.voided), invoiced = active.filter(b => b.invoice_date.slice(0, 7) === month);
  const paidByBill = new Map<string, number>();
  for (const p of payments) paidByBill.set(p.bill_id, (paidByBill.get(p.bill_id) || 0) + p.amount_paise);
  return {
    purchases: invoiced.reduce((n, b) => n + b.total_paise, 0),
    cashPaid: payments.filter(p => p.paid_on.slice(0, 7) === month).reduce((n, p) => n + p.amount_paise, 0),
    outstanding: active.reduce((n, b) => n + b.total_paise - (paidByBill.get(b.id) || 0), 0),
    eligibleItc: invoiced.filter(b => b.itc_status === "eligible").reduce((n, b) => n + billTax(b), 0),
    pendingItc: invoiced.filter(b => b.itc_status === "pending").reduce((n, b) => n + billTax(b), 0),
    paidByBill,
  };
}

// Resolve only unambiguous physical units. Missing size/product data keeps
// profit incomplete instead of assigning a convenient but guessed cost.
export function orderUnits(raw: unknown, skus: Sku[]): { sku: Sku; quantity: number }[] | null {
  const items = parseCartItems(raw);
  if (!items.length) return null;
  const result: { sku: Sku; quantity: number }[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") return null;
    const quantity = Number(item.quantity ?? item.qty ?? 1);
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 100000) return null;
    const key = String(item.productId || item.product_id || item.slug || "").toLowerCase().replace(/-(unisex-|women-)?perfume$/, "").replace(/-50ml$/, "");
    const size = String(item.size || "").toLowerCase().replace(/\s/g, "");
    if (key === "trial-pack" || ["3x8ml", "3×8ml"].includes(size)) {
      const name = String(item.name || item.title || item.product_name || "").toLowerCase();
      const matches = skus.filter(s => s.size === "8ml" && name.includes(s.product_key.replaceAll("-", " ")));
      if (matches.length !== 3) return null;
      result.push(...matches.map(sku => ({ sku, quantity })));
    } else {
      const matches = skus.filter(s => s.product_key === key && s.size === size);
      if (matches.length !== 1) return null;
      result.push({ sku: matches[0], quantity });
    }
  }
  return result;
}
export function costOrders(orders: (AccountOrder & { items?: unknown })[], skus: Sku[], costs: ProductCost[]) {
  const missing: { id: string; number: string; reason: string }[] = [];
  let cogs = 0, covered = 0;
  for (const order of orders.filter(isPaidOrder)) {
    if (codNeedsReview(order)) { missing.push({ id: order.id, number: order.order_number, reason: "Return / cancellation requires reconciliation" }); continue; }
    const units = orderUnits(order.items, skus);
    if (!units) { missing.push({ id: order.id, number: order.order_number, reason: "Product or size cannot be mapped" }); continue; }
    let orderCost = 0, complete = true;
    for (const { sku, quantity } of units) {
      const cost = costs.filter(c => c.sku_id === sku.id && c.effective_from <= dateKey(order.created_at)).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
      if (!cost) { complete = false; break; }
      orderCost += cost.unit_cost_paise * quantity;
    }
    if (complete && Number.isSafeInteger(orderCost)) { cogs += orderCost; covered++; }
    else missing.push({ id: order.id, number: order.order_number, reason: "No cost version effective on order date" });
  }
  return { cogs, covered, missing };
}
export function profitSummary(orders: (AccountOrder & { items?: unknown })[], bills: Bill[], daily: MetaDaily[], sync: MetaSync | undefined, skus: Sku[], costs: ProductCost[], month: string, through: string) {
  const cost = costOrders(orders, skus, costs), relevant = bills.filter(b => !b.voided && b.service_month === month);
  const metaBills = relevant.filter(b => b.category === "meta_ads");
  const metaSpend = daily.filter(d => d.day.startsWith(month)).reduce((n, d) => n + d.spend_paise, 0);
  const metaReady = !!sync && sync.through_date >= through && sync.currency === "INR" && ["Asia/Kolkata", "Asia/Calcutta"].includes(sync.timezone);
  const advertising = metaReady ? metaSpend + metaBills.reduce((n, b) => n + (b.itc_status === "eligible" ? 0 : billTax(b)), 0) : null;
  const expenses = relevant.filter(b => !["materials", "meta_ads"].includes(b.category)).reduce((n, b) => n + expenseCost(b), 0);
  const sales = orders.filter(isPaidOrder).reduce((n, o) => n + gstSplit(o.amount_in_paise, o.customer_state).taxable, 0);
  const estimate = !cost.missing.length && advertising !== null ? sales - cost.cogs - expenses - advertising : null;
  return { ...cost, sales, expenses, advertising, estimate, metaReady, metaSpend, metaBilled: metaBills.reduce((n, b) => n + b.subtotal_paise, 0) };
}

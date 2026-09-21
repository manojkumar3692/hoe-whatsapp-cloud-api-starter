"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Bill, BILL_CATEGORIES, BillItem, Sku, itemTotal, parseItems } from "../../lib/finance";
import { money } from "../../lib/accounting";
import styles from "./accounts.module.css";

type Line = { description: string; quantity: string; unit: string; unit_cost: string };
const blankLine = (): Line => ({ description: "", quantity: "1", unit: "pcs", unit_cost: "" });
function displayLines(items?: BillItem[]): Line[] { return items?.map(i => ({ description: i.description, quantity: String(i.quantity_milli / 1000), unit: i.unit, unit_cost: (i.unit_cost_paise / 100).toFixed(2) })) || [blankLine()]; }
function Lines({ value, onChange }: { value: Line[]; onChange: (v: Line[]) => void }) {
  const labels = { description: "Item / component", quantity: "Quantity", unit: "Unit", unit_cost: "Unit cost ₹" };
  return <div className={styles.lines}>
    {value.map((line, index) => <div className={styles.lineRow} key={index}>
      {(["description", "quantity", "unit", "unit_cost"] as const).map(field => <label key={field}>
        <span>{labels[field]}</span>
        <input aria-label={`${field.replaceAll("_", " ")} line ${index + 1}`} value={line[field]} required
          maxLength={field === "description" ? 200 : field === "unit" ? 30 : undefined}
          type={field === "quantity" || field === "unit_cost" ? "number" : "text"}
          step={field === "quantity" ? "0.001" : field === "unit_cost" ? "0.01" : undefined}
          min={field === "quantity" ? "0.001" : field === "unit_cost" ? "0" : undefined}
          placeholder={field === "description" ? "Perfume, sheet, box…" : undefined}
          onChange={event => onChange(value.map((row, i) => i === index ? { ...row, [field]: event.target.value } : row))} />
      </label>)}
      <button type="button" className="secondary" disabled={value.length === 1} aria-label={`Remove line ${index + 1}`}
        onClick={() => onChange(value.filter((_, i) => i !== index))}>×</button>
    </div>)}
    <button className="secondary" type="button" onClick={() => onChange([...value, blankLine()])} disabled={value.length >= 100}>+ Add line</button>
  </div>;
}
async function save(url: string, body: FormData | Record<string, unknown>) {
  const response = await fetch(url, { method: "POST", ...(body instanceof FormData ? { body } : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) });
  if (response.redirected) throw new Error("Your session expired. Sign in again.");
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not save. Please retry.");
  return result;
}
function Feedback({ error, success }: { error: string; success: string }) { return <>{error && <p className={styles.formError} role="alert">{error}</p>}{success && <p className={styles.formSuccess} role="status">{success}</p>}</>; }

export function BillForm({ bill, today, enabled = true }: { bill?: Bill; today: string; enabled?: boolean }) {
  const router = useRouter(), [lines, setLines] = useState(displayLines(bill?.items)), [id] = useState(() => bill?.id || crypto.randomUUID());
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  const [tax, setTax] = useState([bill?.cgst_paise || 0, bill?.sgst_paise || 0, bill?.igst_paise || 0].map(v => (v / 100).toFixed(2)));
  let subtotal: number | null = null; try { subtotal = itemTotal(parseItems(lines)); } catch { /* incomplete input */ }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    const form = new FormData(event.currentTarget), raw = Object.fromEntries(form.entries());
    const payload = new FormData(); payload.set("bill", JSON.stringify({ ...raw, items: lines, id, version: bill?.version || 0 }));
    const file = form.get("invoice"); if (file instanceof File && file.size) payload.set("invoice", file);
    try { const result = await save("/api/accounts/bills", payload); setSuccess("Supplier bill saved."); router.push(`/accounts/purchases?month=${String(raw.invoice_date).slice(0, 7)}&edit=${result.id}`); router.refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not save."); } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className={styles.financeForm}><fieldset disabled={!enabled || busy}>
    <div className={styles.formGrid}>
      <label>Supplier<input name="supplier" defaultValue={bill?.supplier} required maxLength={200} placeholder="Supplier or company name" /></label>
      <label>Supplier GSTIN<input name="supplier_gstin" defaultValue={bill?.supplier_gstin || ""} maxLength={15} placeholder="Optional for unregistered suppliers" /></label>
      <label>Invoice number<input name="invoice_number" defaultValue={bill?.invoice_number} required maxLength={100} /></label>
      <label>Invoice date<input name="invoice_date" type="date" defaultValue={bill?.invoice_date || today} required /></label>
      <label>Payment due date<input name="due_date" type="date" defaultValue={bill?.due_date || ""} /></label>
      <label>Category<select name="category" defaultValue={bill?.category || "materials"}>{Object.entries(BILL_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Expense / service month<input name="service_month" type="month" defaultValue={bill?.service_month || today.slice(0, 7)} required /></label>
      <label>Invoice attachment<input name="invoice" type="file" accept="application/pdf,image/png,image/jpeg" /><small>PDF, PNG or JPEG · up to 5 MB{bill?.document_path ? " · existing attachment kept unless replaced" : ""}</small></label>
    </div>
    <h3>Invoice lines · unit prices excluding GST</h3><Lines value={lines} onChange={setLines} />
    <div className={styles.formGrid}>{["CGST", "SGST", "IGST"].map((name, i) => <label key={name}>{name} on supplier invoice ₹<input name={name.toLowerCase()} type="number" min="0" step="0.01" value={tax[i]} onChange={e => setTax(tax.map((v, k) => k === i ? e.target.value : v))} required /></label>)}</div>
    <p className={styles.calculated}>Invoice total: <strong>{subtotal === null || tax.some(t => !t || !Number.isFinite(Number(t))) ? "Complete the line items" : money(subtotal + tax.reduce((n, t) => n + Math.round(Number(t) * 100), 0))}</strong></p>
    <div className={styles.formGrid}><label>Input GST review<select name="itc_status" defaultValue={bill?.itc_status || "pending"}><option value="pending">Pending reconciliation</option><option value="eligible">Eligible · verified by accounts</option><option value="ineligible">Not eligible</option></select></label><label>Credit reconciliation note<input name="itc_note" maxLength={1000} defaultValue={bill?.itc_note} placeholder="Required for eligible credit; e.g. GSTR-2B match" /></label></div>
    <label>Notes<textarea name="notes" maxLength={2000} defaultValue={bill?.notes} rows={2} /></label>
    <p className={styles.footnote}>Materials are recorded as purchases, not deducted again as operating expenses. Meta invoice base amounts reconcile synced spend. Record actual payments separately after saving.</p>
    <button type="submit">{busy ? "Saving…" : bill ? "Save bill changes" : "Save supplier bill"}</button>
  </fieldset><Feedback error={error} success={success} /></form>;
}
export function PaymentForm({ billId, outstanding, today }: { billId: string; outstanding: number; today: string }) {
  const router = useRouter(), [id, setId] = useState(() => crypto.randomUUID()), [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; setBusy(true); setError(""); setSuccess("");
    try { await save("/api/accounts/payments", { ...Object.fromEntries(new FormData(form)), id, bill_id: billId }); setId(crypto.randomUUID()); form.reset(); setSuccess("Payment recorded. No bank transfer was made by this app."); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Payment could not be recorded."); } finally { setBusy(false); }
  }
  return <form className={styles.financeForm} onSubmit={submit}><fieldset disabled={busy || outstanding <= 0}><div className={styles.formGrid}><label>Amount paid ₹<input name="amount" type="number" min="0.01" step="0.01" max={outstanding / 100} required /></label><label>Payment date<input name="paid_on" type="date" defaultValue={today} max={today} required /></label><label>Payment reference<input name="reference" required maxLength={200} placeholder="Bank / UPI reference or cash receipt" /></label></div><button type="submit">{busy ? "Recording…" : "Record payment"}</button></fieldset><Feedback error={error} success={success} /></form>;
}
export function CostForm({ skus, today, enabled = true }: { skus: Sku[]; today: string; enabled?: boolean }) {
  const router = useRouter(), [lines, setLines] = useState<Line[]>([blankLine()]), [id, setId] = useState(() => crypto.randomUUID()), [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  let total: number | null = null; try { total = itemTotal(parseItems(lines)); } catch { /* incomplete input */ }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; setBusy(true); setError(""); setSuccess("");
    try { await save("/api/accounts/costs", { ...Object.fromEntries(new FormData(form)), components: lines, id }); setId(crypto.randomUUID()); setLines([blankLine()]); setSuccess("Cost version saved. Orders use the version effective on their order date."); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save cost."); } finally { setBusy(false); }
  }
  return <form className={styles.financeForm} onSubmit={submit}><fieldset disabled={!enabled || busy}><div className={styles.formGrid}><label>Finished product<select name="sku_id" required defaultValue=""><option value="" disabled>Choose a product / size</option>{skus.map(s => <option key={s.id} value={s.id}>{s.product_name} · {s.size}</option>)}</select></label><label>Effective from<input name="effective_from" type="date" defaultValue={today} required /></label></div><h3>Components needed to make one unit</h3><Lines value={lines} onChange={setLines} /><p className={styles.calculated}>Cost per finished unit: <strong>{total === null ? "Complete the components" : money(total)}</strong></p><label>Cost basis / change note<textarea name="notes" maxLength={2000} required placeholder="Supplier invoice references, perfume quantity, packaging and labour basis" /></label><p className={styles.footnote}>Include perfume, bottle, sheet, label, box and production labour. Exclude recoverable GST. Include unrecoverable taxes. Do not include advertising or courier charges here. Discovery sets use the sum of their three 8 ml units; allocate shared packaging across those units.</p><button type="submit">{busy ? "Saving…" : "Save dated cost version"}</button></fieldset><Feedback error={error} success={success} /></form>;
}
export function MetaSyncButton({ month, enabled }: { month: string; enabled: boolean }) {
  const router = useRouter(), [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  async function sync() { setBusy(true); setError(""); setSuccess(""); try { const result = await save("/api/accounts/meta/sync", { month }); setSuccess(`Synced ${result.campaigns} campaigns through ${result.through}.`); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Sync failed."); } finally { setBusy(false); } }
  return <div><button type="button" onClick={sync} disabled={!enabled || busy}>{busy ? "Syncing Meta…" : "Sync selected month"}</button><Feedback error={error} success={success} /></div>;
}

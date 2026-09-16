import Link from "next/link";
import Header from "../components/Header";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function stockTone(stock: number, threshold: number) {
  if (stock <= 0) return { color: "#991b1b", bg: "#fee2e2", label: "Out of stock" };
  if (stock <= threshold) return { color: "#92400e", bg: "#fef3c7", label: "Low stock" };
  return { color: "#166534", bg: "#dcfce7", label: "In stock" };
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string; availability_updated?: string }>;
}) {
  const params = await searchParams;
  const supabase = supabaseAdmin();
  const [{ data: skus, error }, { data: movements }, { data: unmappedItems }] = await Promise.all([
    supabase
      .from("inventory_skus")
      .select("*")
      .eq("active", true)
      .order("product_name")
      .order("size"),
    supabase
      .from("inventory_movements")
      .select("*, inventory_skus(sku, product_name, size)")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("inventory_unmapped_items")
      .select("id, order_number, item, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <main>
      <Header active="inventory" />

      <div className="responsive-row" style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Inventory</h1>
          <p className="muted" style={{ margin: "5px 0 20px" }}>
            Only paid orders consume stock. A trial pack consumes one 8ML unit from each of its three selected fragrances.
          </p>
        </div>
        <Link href="/" style={{ fontSize: 13 }}>← Dashboard</Link>
      </div>

      {params.updated === "1" && (
        <div style={{ padding: "12px 16px", marginBottom: 18, borderRadius: 10, background: "#dcfce7", color: "#166534", fontWeight: 700 }}>
          Stock updated and recorded in the movement history.
        </div>
      )}

      {params.availability_updated === "1" && (
        <div style={{ padding: "12px 16px", marginBottom: 18, borderRadius: 10, background: "#dcfce7", color: "#166534", fontWeight: 700 }}>
          Storefront availability updated. The mini-store will use the new setting on its next availability refresh.
        </div>
      )}

      {error && (
        <div style={{ padding: 16, borderRadius: 10, background: "#fee2e2", color: "#991b1b" }}>
          Inventory is not set up yet. Apply migration 008_inventory.sql. ({error.message})
        </div>
      )}

      {(unmappedItems || []).length > 0 && (
        <div style={{ padding: 16, marginBottom: 18, borderRadius: 10, background: "#fee2e2", color: "#991b1b" }}>
          <strong>{unmappedItems!.length} paid item{unmappedItems!.length === 1 ? "" : "s"} could not be matched to stock.</strong>
          <div style={{ fontSize: 13, marginTop: 5 }}>
            Review the order(s) before fulfilling: {unmappedItems!.map((row: any, index: number) => (
              <span key={row.id}>{index > 0 ? ", " : ""}<Link href={`/orders?q=${encodeURIComponent(row.order_number)}`}>{row.order_number}</Link></span>
            ))}
          </div>
        </div>
      )}

      <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
        {(skus || []).map((sku: any) => {
          const tone = stockTone(sku.current_stock, sku.low_stock_threshold);
          return (
            <section key={sku.id} className="card" style={{ borderTop: `4px solid ${tone.color}` }}>
              <div className="responsive-row" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{sku.product_name}</div>
                  <div className="muted" style={{ fontSize: 13 }}>{sku.size.toUpperCase()} · {sku.sku}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 32, fontWeight: 900, color: tone.color, lineHeight: 1 }}>{sku.current_stock}</div>
                  <div style={{ fontSize: 11, marginTop: 5, padding: "3px 7px", borderRadius: 999, color: tone.color, background: tone.bg, fontWeight: 700 }}>{tone.label}</div>
                </div>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>
                Opening stock: {sku.opening_stock} · Low-stock warning at {sku.low_stock_threshold}
              </div>

              <div style={{ marginTop: 12, padding: 11, borderRadius: 9, background: sku.storefront_enabled ? "#f0fdf4" : "#fef2f2", color: sku.storefront_enabled ? "#166534" : "#991b1b", fontSize: 12 }}>
                <strong>{sku.size === "8ml" ? "Discovery Set" : "Main store"}: {sku.storefront_enabled ? "Enabled" : "Manually disabled"}</strong>
                <div style={{ marginTop: 3 }}>
                  {sku.current_stock <= 0
                    ? "Customers cannot buy this SKU because stock is zero."
                    : sku.storefront_enabled
                      ? "Customers can buy this SKU while stock remains."
                      : "Stock remains tracked, but customers cannot select or buy it."}
                </div>
              </div>

              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                  {sku.storefront_enabled ? "Disable on storefront" : "Enable on storefront"}
                </summary>
                <form action="/api/inventory/storefront" method="POST" style={{ marginTop: 12, display: "grid", gap: 9 }}>
                  <input type="hidden" name="sku_id" value={sku.id} />
                  <input type="hidden" name="enabled" value={sku.storefront_enabled ? "false" : "true"} />
                  <input name="reason" required minLength={3} placeholder={sku.storefront_enabled ? "Reason for disabling" : "Reason for enabling"} style={inputStyle} />
                  <input name="admin_password" type="password" required placeholder="Admin password" style={inputStyle} />
                  <button type="submit" style={{ ...buttonStyle, background: sku.storefront_enabled ? "#991b1b" : "#166534" }}>
                    {sku.storefront_enabled ? "Disable this SKU" : "Enable this SKU"}
                  </button>
                </form>
              </details>

              <details style={{ marginTop: 14 }}>
                <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Adjust or override stock</summary>
                <form action="/api/inventory/adjust" method="POST" style={{ marginTop: 12, display: "grid", gap: 9 }}>
                  <input type="hidden" name="sku_id" value={sku.id} />
                  <select name="mode" style={inputStyle} defaultValue="adjust">
                    <option value="adjust">Adjust by (+ add / − remove)</option>
                    <option value="set">Set exact count (override)</option>
                  </select>
                  <input name="quantity" type="number" step="1" required placeholder="e.g. 10 or -2" style={inputStyle} />
                  <input name="reason" required minLength={3} placeholder="Reason (delivery, damage, stock count…)" style={inputStyle} />
                  <input name="admin_password" type="password" required placeholder="Admin password" style={inputStyle} />
                  <button type="submit" style={buttonStyle}>Save stock change</button>
                </form>
              </details>
            </section>
          );
        })}
      </div>

      <section className="card" style={{ marginTop: 24, overflowX: "auto" }}>
        <h2 style={{ marginTop: 0 }}>Recent stock movements</h2>
        <table role="table" className="mobile-table">
          <thead role="rowgroup">
            <tr role="row"><th role="columnheader" scope="col">When</th><th role="columnheader" scope="col">SKU</th><th role="columnheader" scope="col">Change</th><th role="columnheader" scope="col">Balance</th><th role="columnheader" scope="col">Source / reason</th></tr>
          </thead>
          <tbody role="rowgroup">
            {(movements || []).map((movement: any) => {
              const sku = Array.isArray(movement.inventory_skus) ? movement.inventory_skus[0] : movement.inventory_skus;
              return (
                <tr role="row" key={movement.id}>
                  <td data-label="When" role="cell" style={{ whiteSpace: "nowrap" }}>{new Date(movement.created_at).toLocaleString("en-IN")}</td>
                  <td data-label="SKU" role="cell"><strong>{sku?.product_name}</strong><div className="muted" style={{ fontSize: 12 }}>{sku?.size?.toUpperCase()}</div></td>
                  <td data-label="Change" role="cell" style={{ fontWeight: 800, color: movement.quantity_delta < 0 ? "#991b1b" : "#166534" }}>
                    {movement.quantity_delta > 0 ? "+" : ""}{movement.quantity_delta}
                  </td>
                  <td data-label="Balance" role="cell">{movement.resulting_stock}</td>
                  <td data-label="Source / reason" role="cell">
                    {movement.order_number ? <Link href={`/orders?q=${encodeURIComponent(movement.order_number)}`}>{movement.order_number}</Link> : movement.reason}
                    {movement.order_number && <div className="muted" style={{ fontSize: 12 }}>{movement.reason}</div>}
                  </td>
                </tr>
              );
            })}
            {(!movements || movements.length === 0) && <tr role="row"><td role="cell" colSpan={5} className="muted">No stock movements yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </main>
  );
}

const inputStyle = { width: "100%", padding: 9, border: "1px solid #ded2c2", borderRadius: 8, background: "#fff" };
const buttonStyle = { padding: "10px 14px", border: 0, borderRadius: 8, background: "#1c1712", color: "#fff", cursor: "pointer", fontWeight: 700 };

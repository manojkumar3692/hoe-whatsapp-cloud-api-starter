import { parseCartItems } from "./cartItems";
import { orderUnits, Sku } from "./finance";

export type GenieOrder = { id: string; created_at: string; payment_status: string; shipping_status: string; is_hidden: boolean; amount_in_paise: number; items: unknown };
export type GenieSku = Sku & { current_stock: number; low_stock_threshold: number; active: boolean };
const DAY = 86_400_000;
const OFFSET = 4 * 3_600_000;
const excluded = new Set(["cancelled", "returned", "refunded", "rejected", "return_requested", "delivery_disputed"]);
export function growth(current: number, previous: number) { return previous > 0 ? Math.round((current - previous) / previous * 1000) / 10 : null; }
export function geniePeriods(now = new Date()) {
  const local = new Date(now.getTime() + OFFSET);
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - OFFSET;
  const month = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - OFFSET;
  const prevMonth = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1) - OFFSET;
  const monthDays = Math.min(Math.round((today - month) / DAY), Math.round((month - prevMonth) / DAY));
  const weekDays = (local.getUTCDay() + 6) % 7;
  const week = today - weekDays * DAY;
  return { today, month: { from: month, to: month + monthDays * DAY, previousFrom: prevMonth, previousTo: prevMonth + monthDays * DAY, days: monthDays }, week: { from: week, to: today, previousFrom: week - 7 * DAY, previousTo: today - 7 * DAY, days: weekDays } };
}
export function buildGenie(orders: GenieOrder[], skus: GenieSku[], now = new Date()) {
  const periods = geniePeriods(now);
  const visible = orders.filter(o => !o.is_hidden && Date.parse(o.created_at) < now.getTime());
  const paid = visible.filter(o => o.payment_status === "paid" && !excluded.has(o.shipping_status));
  const valid = paid.filter(o => Number.isSafeInteger(o.amount_in_paise) && o.amount_in_paise >= 0 && Number.isFinite(Date.parse(o.created_at)));
  const between = (from: number, to: number) => valid.filter(o => Date.parse(o.created_at) >= from && Date.parse(o.created_at) < to);
  const summary = (rows: GenieOrder[]) => ({ orders: rows.length, sales: rows.reduce((n, o) => n + o.amount_in_paise, 0), aov: rows.length ? Math.round(rows.reduce((n, o) => n + o.amount_in_paise, 0) / rows.length) : 0 });
  const comparison = (p: typeof periods.month) => {
    const currentRows = between(p.from, p.to), previousRows = between(p.previousFrom, p.previousTo);
    const current = summary(currentRows), previous = summary(previousRows);
    const counts = (rows: GenieOrder[]) => {
      const units = new Map<string, number>(); let unmappedOrders = 0, trialPacks = 0;
      for (const o of rows) {
        for (const item of parseCartItems(o.items)) {
          if (!item || typeof item !== "object") continue;
          const key = String(item.productId || item.product_id || item.slug || "").toLowerCase();
          const size = String(item.size || "").toLowerCase().replace(/\s/g, "");
          const qty = Number(item.quantity ?? item.qty ?? 1);
          if ((key === "trial-pack" || ["3x8ml", "3×8ml"].includes(size)) && Number.isSafeInteger(qty) && qty > 0) trialPacks += qty;
        }
        const mapped = orderUnits(o.items, skus);
        if (!mapped) { unmappedOrders++; continue; }
        for (const row of mapped) units.set(row.sku.id, (units.get(row.sku.id) || 0) + row.quantity);
      }
      return { units, unmappedOrders, trialPacks };
    };
    const a = counts(currentRows), b = counts(previousRows);
    return { ...p, current, previous, salesGrowth: growth(current.sales, previous.sales), orderGrowth: growth(current.orders, previous.orders), trialPacks: a.trialPacks, previousTrialPacks: b.trialPacks, unmappedOrders: a.unmappedOrders, previousUnmappedOrders: b.unmappedOrders, products: skus.map(s => ({ name: s.product_name, key: s.product_key, size: s.size, current: a.units.get(s.id) || 0, previous: b.units.get(s.id) || 0, stock: s.current_stock, active: s.active })).sort((x, y) => y.current - x.current || x.name.localeCompare(y.name)) };
  };
  const recent = between(periods.today - 28 * DAY, periods.today);
  const recentUnits = new Map<string, number>();
  for (const o of recent) for (const u of orderUnits(o.items, skus) || []) recentUnits.set(u.sku.id, (recentUnits.get(u.sku.id) || 0) + u.quantity);
  const stock = skus.filter(s => s.active).map(s => {
    const units = recentUnits.get(s.id) || 0;
    return { name: s.product_name, size: s.size, stock: s.current_stock, units28d: units, daysCover: units > 0 ? Math.max(0, Math.round(s.current_stock / (units / 28))) : null, low: s.current_stock <= s.low_stock_threshold };
  }).sort((a,b) => (a.daysCover ?? Infinity) - (b.daysCover ?? Infinity));
  const daily = Array.from({ length: 28 }, (_, i) => {
    const from = periods.today - (28 - i) * DAY;
    return { date: new Date(from + OFFSET).toISOString().slice(0,10), ...summary(between(from, from + DAY)) };
  });
  return { generatedAt: now.toISOString(), timezone: "Asia/Dubai", allTime: summary(valid), loadedOrders: visible.length, excludedOrders: visible.filter(o => o.payment_status === "paid" && excluded.has(o.shipping_status)).length, invalidAmounts: paid.length - valid.length, firstOrderAt: valid.map(o => o.created_at).sort()[0] || null, month: comparison(periods.month), week: comparison(periods.week), stock, daily };
}
export type GenieSnapshot = ReturnType<typeof buildGenie>;
export function genieActions(snapshot: GenieSnapshot, period: "month" | "week") {
  const p = snapshot[period];
  const actions: { title: string; evidence: string; action: string; href: string }[] = [];
  const risk = snapshot.stock.find(s => s.units28d > 0 && (s.low || (s.daysCover !== null && s.daysCover < 14)));
  if (risk) actions.push({ title: `Check ${risk.name} ${risk.size} stock`, evidence: `${risk.units28d} units moved in 28 complete days; ${risk.stock} on hand, about ${risk.daysCover} days at that pace.`, action: "Check physical stock and supplier lead time before promoting it. Reservations are not deducted from this estimate.", href: "/inventory" });
  const leader = p.products.find(s => s.size === "50ml" && s.current > 0);
  if (leader) {
    const tied = p.products.filter(s => s.size === "50ml" && s.current === leader.current).length > 1;
    actions.push({ title: leader.current < 5 ? "Bottle demand is still an early signal" : `${leader.name} ${tied ? "shares the lead in" : "leads"} bottle sales`, evidence: `${leader.name}: ${leader.current} bottle${leader.current === 1 ? "" : "s"} this period versus ${leader.previous} previously.${tied ? " Other products have the same current count." : ""}`, action: leader.current < 5 ? "There are fewer than five sales for the top bottle. Gather more orders before choosing a winner or moving advertising budget." : leader.stock > 0 ? "Test a focused creative or product-page feature. Track paid orders before increasing spend; sales volume does not establish profitability." : "Replenish stock before testing a promotion.", href: "/orders" });
  }
  const falling = p.products.find(s => s.previous >= 5 && s.current < s.previous * 0.7);
  if (falling) actions.push({ title: `Investigate ${falling.name} ${falling.size}`, evidence: `${falling.current} units versus ${falling.previous} previously.`, action: "Check availability, traffic and campaign changes. These orders show a decline, but cannot establish its cause.", href: "/accounts/advertising" });
  if (p.current.orders < 10) actions.push({ title: "Build more evidence", evidence: `${p.current.orders} qualifying orders in this period.`, action: "Treat product rankings as early signals. Test one change at a time and compare a longer period before shifting budget.", href: "/orders" });
  if (p.unmappedOrders || p.previousUnmappedOrders) actions.push({ title: "Complete product mapping", evidence: `${p.unmappedOrders} current and ${p.previousUnmappedOrders} previous-period orders could not be fully mapped to SKUs.`, action: "Their order values are counted, but their product units are omitted. Resolve product/size data before relying on rankings.", href: "/inventory" });
  return actions;
}

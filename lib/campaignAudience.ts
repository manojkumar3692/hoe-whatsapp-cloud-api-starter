import { isTrialPack } from "./followups";
import { normalizePhone } from "./phone";

export type CampaignOrder = {
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_city?: string | null;
  items?: unknown;
  payment_status?: string | null;
  is_hidden?: boolean | null;
};

export type CampaignAudienceCustomer = {
  name: string;
  phone: string;
  product: string;
  city: string;
};

/**
 * Convert newest-first order rows into a unique Trial Pack buyer audience.
 * Only confirmed (paid), visible orders qualify. The limit is applied after
 * product filtering and phone deduplication, rather than to raw order rows.
 */
export function trialPackAudienceFromOrders(
  orders: CampaignOrder[],
  limit: number
): CampaignAudienceCustomer[] {
  const byPhone = new Map<string, CampaignAudienceCustomer>();

  for (const order of orders) {
    if (byPhone.size >= limit) break;
    if (order.payment_status !== "paid" || order.is_hidden || !isTrialPack(order.items)) {
      continue;
    }

    const phone = normalizePhone(order.customer_phone || "");
    if (!phone || byPhone.has(phone)) continue;

    byPhone.set(phone, {
      name: String(order.customer_name || "Unknown").trim() || "Unknown",
      phone,
      product: "Trial Pack",
      city: String(order.customer_city || "").trim(),
    });
  }

  return Array.from(byPhone.values());
}

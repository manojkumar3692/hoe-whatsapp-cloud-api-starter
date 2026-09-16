import { supabaseAdmin } from "./supabaseAdmin";

export const UNSHIPPED_STATUSES = ["pending", "confirmed", "packed"];
export const ABANDONED_PAYMENT_STATUSES = ["pending", "failed"];
// Exclude only unpaid, unshipped checkouts; retain fulfilled orders with stale payment fields.
export const REAL_ORDERS_FILTER = "payment_status.is.null,payment_status.not.in.(pending,failed),shipping_status.is.null,shipping_status.not.in.(pending,confirmed,packed)";

export type OrderFilters = Record<string, string | undefined>;

export function orderView(params: OrderFilters) {
  const isHiddenReview = params.show_hidden === "1";
  // Keep the old payment_pending URL working for bookmarked links, but use
  // the accurate "abandoned payment" language everywhere in the UI.
  const isAbandonedPaymentView = ["payment_pending", "abandoned_payment"].includes(params.view || "") && !isHiddenReview;
  const isCodBalancePendingView = params.view === "cod_balance_pending" && !isHiddenReview;
  const isDeliveredView = params.view === "delivered" && !isHiddenReview;
  const isDeliveryIssuesView = params.view === "delivery_issues" && !isHiddenReview;
  const isAllView = (!params.view || params.view === "all") || isHiddenReview;
  return { isHiddenReview, isAbandonedPaymentView, isCodBalancePendingView, isDeliveredView, isDeliveryIssuesView, isAllView };
}

export function ordersQuery(params: OrderFilters) {
  const supabase = supabaseAdmin();
  const { isHiddenReview, isAbandonedPaymentView, isCodBalancePendingView, isDeliveredView, isDeliveryIssuesView, isAllView } = orderView(params);
  let query = supabase.from("orders").select("*").order("created_at", { ascending: false }).order("id", { ascending: false });

  if (isHiddenReview) {
    query = query.eq("is_hidden", true);
  } else {
    query = query.eq("is_hidden", false);

    if (isAbandonedPaymentView) {
      // Only orders that are BOTH unpaid AND still unshipped — if fulfillment
      // already moved past packed (shipped/delivered/etc.), payment was
      // confirmed some other way even though our payment_status field never
      // got updated (the storefront's payment callback is browser-only, not
      // a server webhook — see conversation history). That's a stale field
      // to go fix, not a live abandoned checkout to chase down.
      query = query.in("payment_status", ABANDONED_PAYMENT_STATUSES).in("shipping_status", UNSHIPPED_STATUSES);
    } else if (isCodBalancePendingView) {
      query = query
        .eq("payment_status", "paid")
        .eq("payment_type", "partial_cod")
        .eq("cod_balance_status", "pending")
        .not("shipping_status", "in", "(cancelled,returned,refunded,rejected)");
    } else if (isDeliveredView) {
      query = query.eq("payment_status", "paid").in("shipping_status", ["delivered", "completed"]);
    } else if (isDeliveryIssuesView) {
      query = query.eq("shipping_status", "delivery_disputed");
    } else if (isAllView) {
      query = query.or(REAL_ORDERS_FILTER);
      if (params.shipping) {
        query = query.eq("shipping_status", params.shipping);
      }
    } else {
      // Operations view: load paid orders, then retain all of today and
      // yesterday plus any older order that still needs fulfilment. This
      // keeps recent work understandable without losing an old backlog.
      const yesterday = dubaiDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
      query = query.eq("payment_status", "paid").or(
        `created_at.gte.${yesterday}T00:00:00+04:00,shipping_status.in.(pending,confirmed,packed)`
      );
    }
  }

  if (params.payment) {
    query = query.eq("payment_status", params.payment);
  }

  if (params.payment_type) {
    query = query.eq("payment_type", params.payment_type);
  }

  if (params.coupon) {
    query = query.eq("coupon_code", params.coupon);
  }

  const startDate = parseDateBoundary(params.date_from) || getStartDate(params.date);
  const endDate = parseDateBoundary(params.date_to, true);
  if (startDate) query = query.gte("created_at", startDate);
  if (endDate) query = query.lt("created_at", endDate);

  if (params.q?.trim()) {
    const search = params.q.trim().replace(/[,%()]/g, " ");
    query = query.or(
      `order_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,customer_email.ilike.%${search}%,customer_city.ilike.%${search}%`
    );
  }

  return query;
}

function getStartDate(range?: string) {
  const now = new Date();

  if (range === "today") {
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }

  if (range === "7days") {
    now.setDate(now.getDate() - 7);
    return now.toISOString();
  }

  if (range === "month") {
    now.setDate(1);
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }

  return null;
}

function parseDateBoundary(value: string | undefined, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

export function dubaiDateKey(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}


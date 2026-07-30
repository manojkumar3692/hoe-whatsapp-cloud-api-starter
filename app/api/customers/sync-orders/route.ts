import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { normalizePhone } from "../../../../lib/phone";
import { getFirstCartItem, cartItemName } from "../../../../lib/cartItems";

// Two sources feed the CRM here:
// 1. orders — grouped by phone, upserted. New phones become new customers,
//    existing customers only get their order stats refreshed (name/city/etc
//    are left alone so manual CRM edits never get overwritten).
// 2. checkout_sessions — grouped by phone, insert-only. If the phone is
//    already a customer (whether from before, or just added by the orders
//    pass above), it's skipped entirely — no update, no overwrite.

type OrderRow = {
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_city: string | null;
  amount_in_paise: number | null;
  payment_status: string | null;
  created_at: string;
  items: any;
};

type Agg = {
  phone: string;
  name: string;
  email: string | null;
  city: string | null;
  product: string | null;
  totalOrders: number;
  lifetimeValuePaise: number;
  lastOrderDate: string;
};

type SessionRow = {
  name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  cart_items: any;
  paid_at: string | null;
  created_at: string;
};

type SessionAgg = {
  phone: string;
  name: string;
  email: string | null;
  city: string | null;
  product: string | null;
  everPaid: boolean;
};

function firstItemName(items: any): string | null {
  return cartItemName(getFirstCartItem(items));
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    if (form.get("admin_password") !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = supabaseAdmin();

    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select(
        "customer_name, customer_phone, customer_email, customer_city, amount_in_paise, payment_status, created_at, items"
      )
      .order("created_at", { ascending: true })
      .limit(5000);

    if (ordersError) {
      throw ordersError;
    }

    const byPhone = new Map<string, Agg>();

    for (const o of (orders || []) as OrderRow[]) {
      const phone = normalizePhone(o.customer_phone || "");
      if (!phone) continue;

      const isPaid = o.payment_status === "paid";
      const itemName = firstItemName(o.items);
      const existing = byPhone.get(phone);

      if (!existing) {
        byPhone.set(phone, {
          phone,
          name: o.customer_name || "Unknown",
          email: o.customer_email || null,
          city: o.customer_city || null,
          product: itemName,
          totalOrders: 1,
          lifetimeValuePaise: isPaid ? o.amount_in_paise || 0 : 0,
          lastOrderDate: o.created_at,
        });
      } else {
        existing.totalOrders += 1;
        if (isPaid) existing.lifetimeValuePaise += o.amount_in_paise || 0;
        // orders are fetched oldest-first, so the latest one wins for
        // "current" fields
        existing.name = o.customer_name || existing.name;
        existing.city = o.customer_city || existing.city;
        existing.email = o.customer_email || existing.email;
        existing.product = itemName || existing.product;
        existing.lastOrderDate = o.created_at;
      }
    }

    const orderPhones = Array.from(byPhone.keys());

    const { data: existingForOrders, error: existingOrdersError } =
      orderPhones.length > 0
        ? await supabase
            .from("customers")
            .select("id, phone, name")
            .in("phone", orderPhones)
        : { data: [], error: null };

    if (existingOrdersError) {
      throw existingOrdersError;
    }

    // Tracks every phone we know is already (or about to be) a customer,
    // across both passes.
    const knownPhones = new Set(
      (existingForOrders || []).map((c: any) => c.phone)
    );

    const newRows: any[] = [];
    const updates: { phone: string; payload: any }[] = [];

    for (const agg of byPhone.values()) {
      if (!knownPhones.has(agg.phone)) {
        const lastOrderDate = agg.lastOrderDate
          ? agg.lastOrderDate.slice(0, 10)
          : null;

        newRows.push({
          name: agg.name,
          phone: agg.phone,
          email: agg.email,
          city: agg.city,
          product: agg.product,
          source: "orders",
          consent: true,
          total_orders: agg.totalOrders,
          lifetime_value_in_paise: agg.lifetimeValuePaise,
          last_order_date: lastOrderDate,
        });

        knownPhones.add(agg.phone);
      } else {
        const existingCustomer = (existingForOrders || []).find(
          (c: any) => c.phone === agg.phone
        );
        const lastOrderDate = agg.lastOrderDate
          ? agg.lastOrderDate.slice(0, 10)
          : null;

        const payload: any = {
          total_orders: agg.totalOrders,
          lifetime_value_in_paise: agg.lifetimeValuePaise,
          last_order_date: lastOrderDate,
          updated_at: new Date().toISOString(),
        };

        // Only backfill name if the existing record is a placeholder
        // (e.g. auto-created "Unknown" from an inbound WhatsApp message).
        if (
          existingCustomer &&
          (!existingCustomer.name || existingCustomer.name === "Unknown")
        ) {
          payload.name = agg.name;
        }

        updates.push({ phone: agg.phone, payload });
      }
    }

    if (newRows.length > 0) {
      const { error: insertError } = await supabase
        .from("customers")
        .insert(newRows);

      if (insertError) {
        throw insertError;
      }
    }

    for (const u of updates) {
      await supabase.from("customers").update(u.payload).eq("phone", u.phone);
    }

    // ------------------------------------------------------------------
    // Pass 2: checkout_sessions — insert-only, skip anyone already known
    // ------------------------------------------------------------------

    const { data: sessions, error: sessionsError } = await supabase
      .from("checkout_sessions")
      .select("name, phone, email, city, cart_items, paid_at, created_at")
      .not("phone", "is", null)
      .order("created_at", { ascending: true })
      .limit(5000);

    if (sessionsError) {
      throw sessionsError;
    }

    const sessionByPhone = new Map<string, SessionAgg>();

    for (const s of (sessions || []) as SessionRow[]) {
      const phone = normalizePhone(s.phone || "");
      if (!phone) continue;

      const itemName = firstItemName(s.cart_items);
      const existing = sessionByPhone.get(phone);

      if (!existing) {
        sessionByPhone.set(phone, {
          phone,
          name: s.name || "Unknown",
          email: s.email || null,
          city: s.city || null,
          product: itemName,
          everPaid: !!s.paid_at,
        });
      } else {
        // sessions fetched oldest-first, latest wins for display fields
        existing.name = s.name || existing.name;
        existing.email = s.email || existing.email;
        existing.city = s.city || existing.city;
        existing.product = itemName || existing.product;
        existing.everPaid = existing.everPaid || !!s.paid_at;
      }
    }

    const sessionRows: any[] = [];

    for (const agg of sessionByPhone.values()) {
      if (knownPhones.has(agg.phone)) continue; // already a customer — ignore

      sessionRows.push({
        name: agg.name,
        phone: agg.phone,
        email: agg.email,
        city: agg.city,
        product: agg.product,
        source: "checkout_session",
        consent: true,
        tags: agg.everPaid ? [] : ["abandoned_cart"],
      });

      knownPhones.add(agg.phone);
    }

    if (sessionRows.length > 0) {
      const { error: sessionInsertError } = await supabase
        .from("customers")
        .insert(sessionRows);

      if (sessionInsertError) {
        throw sessionInsertError;
      }
    }

    return NextResponse.redirect(
      new URL(
        `/customers?synced=${newRows.length}&updated=${updates.length}&sessions_added=${sessionRows.length}`,
        req.url
      ),
      303
    );
  } catch (e: any) {
    console.error("CUSTOMER ORDER SYNC ERROR:", e);

    return NextResponse.json(
      { error: e.message || "Order/session sync failed" },
      { status: 500 }
    );
  }
}

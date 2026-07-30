import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { normalizePhone } from "../../../../lib/phone";
import { sendTemplateMessage } from "../../../../lib/whatsapp";
import { getFirstCartItem, cartItemName, cartItemSlug } from "../../../../lib/cartItems";
import { resolveProductSlug, resolveProductImageUrl } from "../../../../lib/productCatalog";

// Meant to be hit on a schedule (Vercel Cron, or an external cron pinger —
// see vercel.json / README). Finds checkout sessions that:
//   - never turned into an order (order_number is null)
//   - haven't already been sent a reminder (abandoned_cart_notified_at)
//   - have been sitting long enough to count as "abandoned" (delay_minutes)
//     but not so old it's pointless (max_age_hours)
// ...and sends each one the approved cart-recovery template. Business-
// initiated WhatsApp messages MUST use a pre-approved template — see
// /templates to create and submit one (category MARKETING).
//
// No consent/opt-in filter — business decision, see README and
// migration 003_abandoned_cart.sql for the tradeoff.
//
// The button link: the template's URL is
// "https://www.houseofeon.in/{{1}}" (see /templates). This route fills
// {{1}} with "<STOREFRONT_PRODUCT_PATH_PREFIX>/<real-url-slug>" for the
// first cart item, looking up its real product-page slug in
// lib/productCatalog.ts (cart_items' productId isn't always the same
// string as the URL slug — e.g. "silent-gold" vs
// "silent-gold-unisex-perfume"). Falls back to an empty string (→ your
// homepage) when the productId isn't in that catalog.
//
// Auth: accepts either a Vercel Cron / CRON_SECRET bearer token, or the
// normal admin password (for manual testing), so you can hit this by hand
// before wiring up a schedule.

function isAuthorized(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  const got =
    req.headers.get("x-admin-password") ||
    req.nextUrl.searchParams.get("admin_password");

  if (adminPassword && got === adminPassword) {
    return true;
  }

  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const templateName = process.env.META_ABANDONED_CART_TEMPLATE;

  if (!templateName) {
    return NextResponse.json(
      {
        error:
          "Set META_ABANDONED_CART_TEMPLATE in your env vars to your approved cart-recovery template name first (create/submit it at /templates).",
      },
      { status: 400 }
    );
  }

  const delayMinutes = Number(req.nextUrl.searchParams.get("delay_minutes") || 30);
  const maxAgeHours = Number(req.nextUrl.searchParams.get("max_age_hours") || 48);

  const supabase = supabaseAdmin();

  const cutoffRecent = new Date(Date.now() - delayMinutes * 60 * 1000).toISOString();
  const cutoffOld = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();

  // Note: not filtering on whatsapp_marketing_opt_in — business decision
  // was to message anyone who reached checkout with a phone number,
  // without requiring a separate consent checkbox. See README for the
  // account-quality tradeoff this carries (WhatsApp can throttle/restrict
  // a number based on block/report rates). opt_out / blocked / cooldown
  // are still respected below for anyone already a known customer.
  const { data: sessions, error } = await supabase
    .from("checkout_sessions")
    .select("id, name, phone, cart_items, created_at, last_activity_at")
    .is("order_number", null)
    .is("abandoned_cart_notified_at", null)
    .not("phone", "is", null)
    .lte("created_at", cutoffRecent)
    .gte("created_at", cutoffOld)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ checked: 0, sent: 0, skipped: 0, failed: 0 });
  }

  const phones = sessions
    .map((s: any) => normalizePhone(s.phone || ""))
    .filter(Boolean);

  const { data: customers } = await supabase
    .from("customers")
    .select("id, phone, marketing_health, opt_out, blocked")
    .in("phone", phones);

  const customerByPhone = new Map((customers || []).map((c: any) => [c.phone, c]));

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const results: any[] = [];

  for (const session of sessions as any[]) {
    const phone = normalizePhone(session.phone || "");

    if (!phone) {
      skipped++;
      continue;
    }

    const customer = customerByPhone.get(phone);

    if (
      customer &&
      (customer.opt_out || customer.blocked || customer.marketing_health === "cooldown")
    ) {
      skipped++;
      results.push({ phone, skipped: true, reason: "opted out / blocked / cooldown" });
      continue;
    }

    const item = getFirstCartItem(session.cart_items);
    const productName = cartItemName(item) || "your item";
    const productId = cartItemSlug(item);
    const realProductSlug = resolveProductSlug(productId);
    const customerName = session.name || "there";

    // Dynamic URL button suffix: "products/silent-gold-unisex-perfume" if
    // the productId maps to a known product page, otherwise "" so the
    // button falls back to the template's base URL (your homepage).
    const productPathPrefix = process.env.STOREFRONT_PRODUCT_PATH_PREFIX || "products";
    const buttonUrlParam = realProductSlug ? `${productPathPrefix}/${realProductSlug}` : "";

    // Only pass a header image if the active template actually has an
    // image header component — sending one to a text-header (or no
    // header) template gets rejected by Meta as an unexpected component,
    // and omitting it for an image-header template gets rejected as
    // missing. Flip META_ABANDONED_CART_HEADER_IS_IMAGE=true once you
    // switch META_ABANDONED_CART_TEMPLATE to the image-header version.
    const useImageHeader = process.env.META_ABANDONED_CART_HEADER_IS_IMAGE === "true";
    const headerImageUrl = useImageHeader
      ? resolveProductImageUrl(productId) || undefined
      : undefined;

    try {
      const wa = await sendTemplateMessage({
        to: phone,
        templateName,
        languageCode: process.env.META_ABANDONED_CART_LANGUAGE || "en",
        bodyParams: [customerName, productName],
        headerImageUrl,
        buttonUrlParam,
      });

      const wamid = wa.messages?.[0]?.id;
      const status = wa.messages?.[0]?.message_status || "accepted";

      await supabase.from("message_logs").insert({
        customer_id: customer?.id || null,
        phone,
        direction: "outbound",
        template_name: templateName,
        body: `Abandoned cart reminder: ${productName}`,
        meta_message_id: wamid,
        status,
        raw_response: wa,
      });

      await supabase
        .from("checkout_sessions")
        .update({ abandoned_cart_notified_at: new Date().toISOString() })
        .eq("id", session.id);

      sent++;
      results.push({ phone, sent: true, id: wamid });
    } catch (e: any) {
      failed++;
      results.push({ phone, sent: false, error: e.message });

      await supabase.from("message_logs").insert({
        customer_id: customer?.id || null,
        phone,
        direction: "outbound",
        template_name: templateName,
        body: `Abandoned cart reminder: ${productName}`,
        status: "failed",
        error: e.message,
        raw_response: { error: e.message },
      });
      // Not marking abandoned_cart_notified_at on failure — it'll retry on
      // the next run until max_age_hours pushes it out of range.
    }
  }

  return NextResponse.json({
    checked: sessions.length,
    sent,
    skipped,
    failed,
    results,
  });
}

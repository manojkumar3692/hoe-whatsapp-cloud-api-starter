# HOUSE OF EON WhatsApp Cloud API Starter

A small standalone Next.js project to test the official Meta WhatsApp Cloud API without WATI/Interakt.

## Features
- Import old customers by CSV
- Store customers in Supabase
- Create and submit WhatsApp message templates to Meta for review, without leaving the app
- Send approved WhatsApp template messages
- Automated, opt-in-gated abandoned-cart WhatsApp reminders
- Receive inbound replies and delivery statuses via webhook
- Simple internal admin password protection for send/import actions

## CSV format
```csv
name,phone,product,city,last_order_date
Manoj,9876543210,RANK,Chennai,2026-06-01
```
Phone can be 10 digit India mobile or country-code format like `919876543210`.

## Supabase setup
1. Create a Supabase project.
2. Open SQL editor.
3. Run the files in `supabase/migrations` in numeric order, through `008_inventory.sql`.
4. Copy Supabase URL, anon key, and service role key.

## Meta setup
1. Create Meta Developer app and add WhatsApp product.
2. Get `Phone Number ID`.
3. Generate access token. For production, create a system user permanent token.
4. Create/approve a message template, for example `hoe_new_launch` with two body variables — or use the in-app `/templates` page below to submit new templates without opening Meta Business Manager.
5. Webhook callback URL after deploy:
   `https://YOUR-DOMAIN.com/api/webhook/whatsapp`
6. Verify token must match `META_VERIFY_TOKEN` in env.
7. Subscribe webhook field: `messages`.

## Creating templates from this app (`/templates`)
Templates can now be submitted to Meta for review directly from the app instead of Business Manager. Meta still has to review and approve them — this only removes the manual form-filling step.

Two things are required beyond the normal Meta setup above:

1. **WhatsApp Business Account ID (WABA ID).** In Meta for Developers → your app → WhatsApp → API Setup, it's listed as "WhatsApp Business Account ID" right near the Phone Number ID. Put it in `META_WABA_ID`.
2. **A system-user token with `whatsapp_business_management` permission.** The token in `META_WHATSAPP_TOKEN` from a basic API Setup screen usually only has messaging permission, which is enough to send messages but not to create templates. To get one that can do both:
   - Go to [business.facebook.com](https://business.facebook.com) → Business Settings → Users → System Users → Add.
   - Create a system user (Admin role is simplest), then under Assigned Assets give it access to your WhatsApp Business Account.
   - Click "Generate New Token", pick your app, and select the permissions `whatsapp_business_management`, `whatsapp_business_messaging`, and `business_management`.
   - Copy the token immediately (it's shown once) and use it as `META_WHATSAPP_TOKEN` — this one token then covers both sending and template creation, and doesn't expire like the 24-hour token from the quick-start screen.

Once both are set, go to `/templates`, fill in the form (name, category, body text with `{{1}}`/`{{2}}` placeholders and example values, optional header/footer/button), and submit. New templates start as `PENDING`; use the "Refresh status from Meta" button on the same page to pull the latest approval status.

Image/video headers aren't supported by the in-app form yet — they need a separate media upload step against Meta's Resumable Upload API.

## Automated abandoned-cart WhatsApp reminders
`checkout_sessions` (populated by the storefront) triggers an automatic "you left something in your cart" WhatsApp message to anyone who reached checkout with a phone number but didn't complete an order.

This is a **business-initiated** message — the customer hasn't messaged you first — so it must use a pre-approved template, not free text, regardless of any 24-hour window (that window only governs free-form replies *after* a customer messages you; it doesn't apply here). Build a `MARKETING` category template at `/templates` (Meta requires marketing templates to include its opt-out button), then set `META_ABANDONED_CART_TEMPLATE` to its approved name.

**The "Complete My Order" button** links to the abandoned product when identifiable, your homepage otherwise. Template button URL is `https://www.houseofeon.in/{{1}}` (already filled in on `/templates`) — the sender fills `{{1}}` with `products/<real-url-slug>` or an empty string to fall back to the bare homepage URL. Change the `products/` prefix via `STOREFRONT_PRODUCT_PATH_PREFIX` if your storefront uses a different path.

`cart_items`'s `productId` (e.g. `"silent-gold"`) isn't always the same string as the product page's URL slug (`silent-gold-unisex-perfume`) — `lib/productCatalog.ts` maps between them. **Update that file whenever a product is added, renamed, or its URL changes**, or the button will silently fall back to the homepage for anything missing from the map.

Also note `cart_items` (and `orders.items`) come back from Supabase as a *string* containing JSON, not a native array — `lib/cartItems.ts` handles that; don't add new code that does `Array.isArray(cart_items)` directly.

**Image header variant.** `abandoned_cart_recovery` (v1, live) has a text header. `abandoned_cart_recovery_v2` on `/templates` is pre-filled with an image header instead — creating it uploads one example image to Meta via the Resumable Upload API (needs `META_APP_ID`, from developers.facebook.com → your app → Settings → Basic). Sending doesn't need another upload: it's just a URL per message, via `lib/productCatalog.ts`'s `PRODUCT_IMAGE_URLS` map (falls back to `ABANDONED_CART_FALLBACK_IMAGE_URL` if a product isn't listed, and skips the header entirely if neither is set). To switch to it once approved: set `META_ABANDONED_CART_TEMPLATE=abandoned_cart_recovery_v2` and `META_ABANDONED_CART_HEADER_IS_IMAGE=true`. Leaving that flag `false` (default) keeps the sender from attaching an image to a template that doesn't expect one, which Meta rejects.

**Known tradeoff:** WhatsApp's Business Messaging Policy technically expects explicit opt-in before messaging someone who hasn't messaged you first — just typing a phone number at checkout isn't that. The `checkout_sessions.whatsapp_marketing_opt_in` column exists to support requiring that, but the sender currently does **not** filter on it — by design, per a business decision to message everyone who reaches checkout rather than add a consent checkbox to the storefront. The real risk: customers can block/report a WhatsApp Business number, which lowers its quality rating and throttles messaging limits for *all* traffic from that number, not just this campaign — worth watching deliverability/block rates after this goes live. If that ever needs walking back, re-add `.eq("whatsapp_marketing_opt_in", true)` to the query in `send-abandoned-cart-reminders/route.ts` and have the checkout page set that column on explicit consent.

Setup:
1. Run `supabase/migrations/003_abandoned_cart.sql`.
2. Create and get approval for the cart-recovery template at `/templates`, then set `META_ABANDONED_CART_TEMPLATE` to its name.
3. Set `CRON_SECRET` (already generated in `.env.local` for local dev — generate a new one for production and add it in Vercel's env vars too).
4. **Schedule (we're on Vercel Hobby):** Hobby caps native Vercel Cron at once/day with ±59min precision — deploying a `*/30 * * * *` schedule there fails outright. So:
   - **Primary**: `.github/workflows/abandoned-cart-cron.yml` runs the endpoint every 30 minutes via GitHub Actions (free, no Vercel plan restriction). Add `CRON_SECRET` as a GitHub Actions repo secret (Settings → Secrets and variables → Actions) and swap `YOUR-DOMAIN.com` in the workflow file for your real deployed domain.
   - **Backup**: `vercel.json` has a once-a-day cron hitting the same endpoint, valid on Hobby, as a safety net in case the GitHub Actions workflow ever stops (it auto-disables after 60 days of repo inactivity — check the Actions tab if reminders stop going out). Calling the endpoint from both is harmless; it only ever messages sessions that haven't been notified yet.
   - If you upgrade to Vercel Pro later, you can just change `vercel.json`'s schedule to `*/30 * * * *` and drop the GitHub Actions workflow.
5. To test manually before wiring up a schedule: visit `/api/checkout-sessions/send-abandoned-cart-reminders?admin_password=YOUR_ADMIN_PASSWORD` in a browser.

It skips anyone already marked `opt_out`, `blocked`, or in a marketing `cooldown` from failed sends, and won't message the same session twice.

## Environment variables
Copy `.env.example` to `.env.local` for local development or add them in Vercel.

## Inventory

`/inventory` tracks every fragrance in 8ML and 50ML sizes. Migration `008_inventory.sql` seeds opening stock at 25 units per 8ML SKU and 15 per 50ML SKU, then backfills existing paid orders. Pending and failed checkouts do not consume stock. Trial packs deduct one 8ML unit from each of the three named fragrances; regular bottles deduct their line-item quantity. Refunds/cancellations restore prior allocations, and manual adjustments/absolute overrides require a reason and remain visible in the stock movement history.

### Storefront inventory enforcement

Run `supabase/migrations/010_storefront_inventory.sql` only after migration 008.
It adds an audited storefront enable/disable switch to every 8ML and 50ML SKU,
plus atomic 15-minute checkout reservations. The 8ML switch controls whether a
fragrance can be selected in the Discovery Set; the 50ML switch controls the
main bottle. Stock tracking remains active even when a SKU is manually disabled.

Safe rollout order:

1. Apply migration 010 to the shared Supabase database.
2. Deploy this operations app and verify every count and storefront switch at `/inventory`.
3. Deploy the mini-store with `INVENTORY_ENFORCEMENT_ENABLED=false`.
4. Test `/api/inventory/availability`, a main-bottle checkout and a Discovery Set checkout.
5. Set `INVENTORY_ENFORCEMENT_ENABLED=true` in the mini-store and redeploy.

Turning that environment flag back to `false` is the immediate rollback. The
additive database objects can remain installed and existing paid-order stock
deduction continues to work either way.

## Post-delivery customer follow-ups

Run `supabase/migrations/009_customer_followups.sql`, then open `/follow-ups`.
The migration creates one follow-up for every fully paid, delivered order and
backfills existing eligible orders. Partial-COD purchases only qualify after
the balance is marked collected. Trial-pack feedback supports favourites,
rating, longevity, strength, purchase interest and an outcome-driven next
action. Calls and WhatsApp contacts can be logged with retry times; after three
unanswered attempts the task closes as no response. An inbound WhatsApp reply
moves the customer's latest open follow-up back into progress automatically.

## Order payment queues

The Orders page keeps checkout leads separate from confirmed purchases:

- **Operations — Paid** contains full-payment orders and token-paid COD orders that can be fulfilled.
- **Abandoned Checkouts** contains pending/failed payment records where no payment was confirmed. These remain available for WhatsApp recovery but are marked do-not-fulfil.
- **COD Balance Pending** contains real partial-COD orders whose token was paid and whose remaining balance still needs collection.

The dashboard's **Collected today** amount counts only the COD token until the
balance is marked collected; abandoned checkout values are never counted as
received revenue. Delhivery and Shadowfax tracking do not provide a reliable
COD settlement/remittance flag, so the configured business rule treats a
courier-confirmed delivery of a token-paid COD order as collection: the COD
balance becomes `collected` and the order moves to `completed`. The inference
is recorded in the order timeline.

Courier tracking does not block Orders-page rendering. After the saved order
data appears, the page starts a freshness-throttled background refresh, shows
`Refreshing tracking…`, and refreshes the table when complete. The control
then remains available as a force-refresh button.

For continuous refresh, `.github/workflows/courier-sync-cron.yml` calls the
same secured endpoint every 10 minutes. Add these GitHub Actions repository
secrets before enabling it:

- `APP_BASE_URL`: the deployed app URL without a trailing slash.
- `CRON_SECRET`: the same value configured in the deployed application.

## Local run
```bash
npm install
npm run dev
```

## Deploy to Vercel
1. Push this folder to GitHub.
2. Import project in Vercel.
3. Add all env variables.
4. Deploy.

## Important
- Marketing messages must use approved Meta templates.
- Send to small batches first.
- Keep opt-out/STOP handling before doing large campaigns.
- This is a starter project; add proper login before real production use.

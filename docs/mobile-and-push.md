# Mobile operations and new-order alerts

All dashboard pages use responsive navigation, forms and labelled table cards at
760px and below. No operational controls are removed on mobile. The Orders page
retains status updates, recovery links, hide/unhide, tracking refresh, invoices
and filtered Excel downloads. Desktop tables retain their original layout.

## Enabling real push delivery

The UI and server code are included. Deployment alone does **not** configure the
database or push delivery. Complete these steps on the production environment:

1. Apply `supabase/migrations/012_order_push_notifications.sql` after the existing
   migrations. This adds private subscription, event and receipt tables plus an
   order trigger. It does not backfill existing orders or change order values.
2. Generate one VAPID key pair with `npx web-push generate-vapid-keys --json`.
   Set `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` and `WEB_PUSH_SUBJECT`
   (`mailto:` followed by your actual support email) in the deployment settings.
   Keep the private key server-only and keep the pair stable across deployments.
3. Generate a random `PUSH_WEBHOOK_SECRET` and set it in the deployment settings.
4. In Supabase Database Webhooks, create an **INSERT** webhook on
   `public.order_push_events`. Send **POST** to
   `https://YOUR_DASHBOARD/api/push/dispatch` with the header
   `Authorization: Bearer YOUR_PUSH_WEBHOOK_SECRET`.
   Do not attach the webhook directly to checkout sessions.
5. Configure a scheduled request every minute to **GET** the same endpoint with
   `Authorization: Bearer YOUR_CRON_SECRET`. This drains backlogs and retries
   transient delivery failures even when nobody has the dashboard open. Use
   Supabase Cron or your existing scheduler; webhook delivery supplies the fast
   path. The scheduler must actually be configured; no client polling substitutes
   for it. Alternatively, the included `order-push-retry.yml` GitHub workflow
   retries every five minutes after setting repository variable
   `ENABLE_ORDER_PUSH=true` and the existing `APP_BASE_URL` / `CRON_SECRET`
   secrets. GitHub scheduling can be delayed; keep the webhook for prompt alerts.
   Failed/expired events can be inspected in `order_push_events`.
6. Deploy over HTTPS. Open **Menu → Order alerts → Enable alerts** on each phone.
   iPhone/iPad (iOS/iPadOS 16.4+) requires **Share → Add to Home Screen**, then
   opening that Home Screen app and tapping Enable alerts. Supported Android and
   desktop browsers can subscribe from the browser. Permission is per device.
7. Tap **Test this device** to verify permission/display. Then, in staging, confirm
   a new test order payment and verify the server-generated alert reaches an
   opted-in phone with the dashboard closed. The device test does not prove the
   database webhook is configured.

## Delivery behavior

- Trigger on the first transition to `payment_status = 'paid'` or insertion of a
  paid order, including a paid partial-COD token. Pending/failed checkouts and
  hidden/test records do not create an alert. Repeated updates do not create
  another event for the same order.
- Delivery uses the database payment status. The storefront/payment integration
  must persist successful payment even if the customer closes checkout.
- Only subscriptions already present when the event was created receive it.
  An expired subscription is not used. An authenticated dashboard visit renews
  it for 30 days; logging out removes that device's server subscription.
- Push payloads contain only an order number and dashboard link, not customer
  names, addresses, phone numbers or order totals. Opening the order still
  requires the normal dashboard login.
- Concurrent dispatchers use database leases. Successful device deliveries have
  receipts so retries skip them. Delivery is at least once around a worker crash;
  a stable notification tag replaces an existing alert for the same order.
- Provider 404/410 responses remove expired device subscriptions. Transient
  failures retry up to eight attempts, with backoff, within a 24-hour window.
  A dispatch claims up to five events. Push service TTL is one hour. Browser/OS
  notification settings, Focus mode, network and battery policies affect timing.
- The worker does not cache dashboard pages or customer data. This is an
  installable dashboard with push support, not an offline order-editing app.

References: [WebKit iOS push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/),
[MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API),
[Supabase Database Webhooks](https://supabase.com/docs/guides/database/webhooks).

## Validation performed

- Browser checks using synthetic data: all 11 main sections and five detail
  screens at 320px, 390px, 768px and 1280px. Campaign preview/send controls
  additionally checked at phone width. Login, mobile menu, order filters,
  tracking refresh visibility and order actions inspected without sending
  customer messages or changing real orders.
- `npm run test:push`: PostgreSQL trigger/claim tests, endpoint validation,
  dispatch authorization, push retries/receipts/expired-device removal and
  service-worker notification navigation.
- TypeScript checks and an isolated production build passed.
- HTTP checks: public manifest/worker/icons, protected subscription settings,
  unauthorized dispatch rejection and authenticated Excel download.
- Actual iOS/Android push delivery requires the production setup above and a
  physical-device check; that delivery has not been verified here.

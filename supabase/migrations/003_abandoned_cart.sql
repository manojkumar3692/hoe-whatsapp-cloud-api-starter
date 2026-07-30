-- Support for automated abandoned-cart WhatsApp reminders.
--
-- whatsapp_marketing_opt_in exists but is NOT currently used to gate
-- sending. WhatsApp's Business Messaging Policy technically requires
-- documented, explicit opt-in before a business can message someone who
-- hasn't messaged it first — this column was added to support that, but
-- the business decision (see project conversation) was to message anyone
-- who reaches checkout with a phone number, without a separate consent
-- checkbox. That trades off WhatsApp account quality/deliverability risk
-- (customers can block/report a number, which throttles ALL messaging
-- from it, not just this campaign) for not needing a storefront change.
-- The column is left in place in case that decision gets revisited later
-- — flip send-abandoned-cart-reminders/route.ts back to filtering on it
-- if so.
--
-- abandoned_cart_notified_at prevents sending the same session a reminder
-- more than once.

alter table public.checkout_sessions
  add column if not exists whatsapp_marketing_opt_in boolean not null default false;

alter table public.checkout_sessions
  add column if not exists abandoned_cart_notified_at timestamp with time zone null;

-- dropped and recreated (not just "if not exists") in case this migration
-- ran once before with the older predicate that referenced
-- whatsapp_marketing_opt_in / paid_at
drop index if exists idx_checkout_sessions_abandoned_cart_pending;

create index idx_checkout_sessions_abandoned_cart_pending
  on public.checkout_sessions using btree (created_at)
  where (
    order_number is null
    and abandoned_cart_notified_at is null
  );

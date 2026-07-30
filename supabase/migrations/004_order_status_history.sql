-- HOUSE OF EON WhatsApp Cloud API Starter
-- Order status history / full ecommerce lifecycle.
-- Safe to re-run: every statement is idempotent.
--
-- orders.shipping_status is a plain text column (no check constraint), so it
-- doubles as the single "Order Status" field covering the whole lifecycle:
--   pending -> confirmed -> packed -> shipped -> out_for_delivery ->
--   delivered -> completed
--   (plus: cancelled, return_requested, returned, refunded)
-- No column change needed for that. This migration only adds an audit trail
-- so every status change (with an optional note) is recorded and can be
-- shown as a timeline on the order detail page.
--
-- orders.payment_status is left untouched — that field reflects the payment
-- gateway's state and is relied on elsewhere (dashboard revenue, customer
-- sync) independent of fulfillment status.

-- ============================================================
-- order_status_history
-- ============================================================
create table if not exists public.order_status_history (
  id uuid not null default gen_random_uuid(),
  order_id uuid not null,
  status text not null,
  note text null,
  created_at timestamp with time zone not null default now(),
  constraint order_status_history_pkey primary key (id),
  constraint order_status_history_order_id_fkey foreign key (order_id) references public.orders (id) on delete cascade
);

create index if not exists idx_order_status_history_order_id on public.order_status_history using btree (order_id);
create index if not exists idx_order_status_history_created_at on public.order_status_history using btree (created_at);

-- Backfill: give every existing order a starting history entry reflecting
-- its current status, so the timeline isn't empty for orders created before
-- this migration. Safe to re-run — only inserts for orders with no history yet.
insert into public.order_status_history (order_id, status, note, created_at)
select o.id, o.shipping_status, 'Existing status at time of migration', o.updated_at
from public.orders o
where not exists (
  select 1 from public.order_status_history h where h.order_id = o.id
);

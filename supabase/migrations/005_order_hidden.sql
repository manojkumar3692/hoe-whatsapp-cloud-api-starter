-- HOUSE OF EON WhatsApp Cloud API Starter
-- Manual "hide" flag for test/spam orders — keeps the orders list clean
-- without ever deleting real rows. Safe to re-run: every statement is
-- idempotent.

alter table public.orders
  add column if not exists is_hidden boolean not null default false;

alter table public.orders
  add column if not exists hidden_reason text null;

create index if not exists idx_orders_is_hidden
  on public.orders using btree (is_hidden)
  where (is_hidden = true);

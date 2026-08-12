-- HOUSE OF EON WhatsApp Cloud API Starter
-- Shadowfax shipment tracking — same pattern as 006_delhivery.sql, kept as
-- fully separate columns since an order ships via ONE courier or the
-- other, never both. Safe to re-run: every statement is idempotent.
--
-- shadowfax_waybill: the AWB number for this order's shipment, entered
-- manually on the order page after creating the shipment with Shadowfax
-- (auto-creation via their Order Creation API is a possible future step).
-- shadowfax_last_status_raw / shadowfax_last_synced_at: verbatim status
-- text Shadowfax returned on the last sync, and when — kept alongside our
-- own mapped shipping_status so you can see exactly what Shadowfax said if
-- the mapping ever looks wrong.

alter table public.orders
  add column if not exists shadowfax_waybill text null;

alter table public.orders
  add column if not exists shadowfax_last_status_raw text null;

alter table public.orders
  add column if not exists shadowfax_last_synced_at timestamp with time zone null;

create index if not exists idx_orders_shadowfax_waybill
  on public.orders using btree (shadowfax_waybill)
  where (shadowfax_waybill is not null);

-- HOUSE OF EON WhatsApp Cloud API Starter
-- Delhivery shipment tracking. Safe to re-run: every statement is
-- idempotent.
--
-- delhivery_waybill: the AWB/waybill number for this order's shipment,
-- entered manually on the order page after creating the shipment in
-- Delhivery One (auto-creation via API is a possible future step).
-- delhivery_last_status_raw / delhivery_last_synced_at: verbatim status
-- text Delhivery returned on the last sync, and when — kept alongside our
-- own mapped shipping_status so you can see exactly what Delhivery said if
-- the mapping ever looks wrong.

alter table public.orders
  add column if not exists delhivery_waybill text null;

alter table public.orders
  add column if not exists delhivery_last_status_raw text null;

alter table public.orders
  add column if not exists delhivery_last_synced_at timestamp with time zone null;

create index if not exists idx_orders_delhivery_waybill
  on public.orders using btree (delhivery_waybill)
  where (delhivery_waybill is not null);

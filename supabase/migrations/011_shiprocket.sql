-- Shiprocket tracking fields. Shadowfax's legacy columns are intentionally
-- left in place so applying this migration never destroys historical data.
alter table public.orders
  add column if not exists shiprocket_waybill text null;

alter table public.orders
  add column if not exists shiprocket_last_status_raw text null;

alter table public.orders
  add column if not exists shiprocket_last_synced_at timestamp with time zone null;

alter table public.orders
  add column if not exists shiprocket_courier_name text null;

alter table public.orders
  add column if not exists shiprocket_tracking_url text null;

create index if not exists idx_orders_shiprocket_waybill
  on public.orders using btree (shiprocket_waybill)
  where (shiprocket_waybill is not null);

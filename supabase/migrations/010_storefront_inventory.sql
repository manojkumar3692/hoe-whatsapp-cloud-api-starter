-- Storefront stock enforcement for 8ML Discovery Set selections and 50ML bottles.
--
-- Rollout safety:
--   * storefront_enabled defaults to true, so existing catalogue choices remain enabled.
--   * the storefront controls enforcement with INVENTORY_ENFORCEMENT_ENABLED.
--   * reservations expire automatically from availability calculations after 15 minutes.

alter table public.inventory_skus
  add column if not exists storefront_enabled boolean not null default true;

alter table public.orders
  add column if not exists inventory_reservation_key text;

create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  reservation_key text not null,
  sku_id uuid not null references public.inventory_skus(id) on delete cascade,
  order_id uuid null references public.orders(id) on delete set null,
  quantity integer not null check (quantity > 0),
  status text not null default 'active'
    check (status in ('active', 'released', 'converted', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reservation_key, sku_id)
);

create index if not exists idx_inventory_reservations_active_sku
  on public.inventory_reservations (sku_id, expires_at)
  where status = 'active';

create table if not exists public.inventory_availability_changes (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references public.inventory_skus(id) on delete cascade,
  previous_enabled boolean not null,
  new_enabled boolean not null,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.inventory_reservations enable row level security;
alter table public.inventory_availability_changes enable row level security;

-- Server-only availability result. Exact quantities are used by the storefront
-- server to cap carts, but the public API can choose which fields to expose.
create or replace function public.get_storefront_inventory_availability()
returns table (
  product_key text,
  product_name text,
  size text,
  current_stock integer,
  reserved_stock integer,
  available_stock integer,
  low_stock_threshold integer,
  storefront_enabled boolean,
  available boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.product_key,
    s.product_name,
    s.size,
    s.current_stock,
    coalesce(r.reserved_stock, 0)::integer,
    greatest(s.current_stock - coalesce(r.reserved_stock, 0), 0)::integer,
    s.low_stock_threshold,
    s.storefront_enabled,
    (
      s.active
      and s.storefront_enabled
      and s.current_stock - coalesce(r.reserved_stock, 0) > 0
    ) as available
  from public.inventory_skus s
  left join (
    select sku_id, sum(quantity)::integer as reserved_stock
    from public.inventory_reservations
    where status = 'active' and expires_at > now()
    group by sku_id
  ) r on r.sku_id = s.id
  where s.size in ('8ml', '50ml')
  order by s.product_name, s.size;
$$;

revoke all on function public.get_storefront_inventory_availability() from public;
revoke all on function public.get_storefront_inventory_availability() from anon;
revoke all on function public.get_storefront_inventory_availability() from authenticated;
grant execute on function public.get_storefront_inventory_availability() to service_role;

-- Atomically reserves every physical SKU represented by an order's items.
-- inventory_units_from_items is shared with the paid-order deduction trigger,
-- ensuring reservation and final deduction use the same mapping rules.
create or replace function public.reserve_storefront_inventory(
  p_reservation_key text,
  p_items jsonb,
  p_ttl_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_expected integer := 0;
  v_mapped integer := 0;
  v_reserved integer := 0;
begin
  if p_reservation_key is null or length(trim(p_reservation_key)) < 8 then
    raise exception 'Invalid inventory reservation key';
  end if;
  if p_ttl_seconds < 60 or p_ttl_seconds > 3600 then
    raise exception 'Inventory reservation TTL must be between 60 and 3600 seconds';
  end if;

  update public.inventory_reservations
  set status = 'expired', updated_at = now()
  where status = 'active' and expires_at <= now();

  select coalesce(sum(
    case
      when lower(coalesce(item->>'productId', item->>'product_id', item->>'slug', '')) = 'trial-pack'
        or replace(lower(coalesce(item->>'size', '')), ' ', '') in ('3x8ml', '3×8ml')
        then 3 * case
          when coalesce(item->>'quantity', item->>'qty', '') ~ '^\d+$'
            then greatest(coalesce(item->>'quantity', item->>'qty')::integer, 0)
          else 1
        end
      else case
        when coalesce(item->>'quantity', item->>'qty', '') ~ '^\d+$'
          then greatest(coalesce(item->>'quantity', item->>'qty')::integer, 0)
        else 1
      end
    end
  ), 0)::integer into v_expected
  from jsonb_array_elements(
    case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end
  ) as expanded(item);

  select coalesce(sum(units), 0)::integer into v_mapped
  from public.inventory_units_from_items(p_items);

  if v_expected <= 0 or v_mapped <> v_expected then
    raise exception 'One or more items are unavailable or could not be mapped to inventory';
  end if;

  -- Lock every requested SKU in a stable order. Competing checkouts for the
  -- final unit are therefore serialized rather than both succeeding.
  perform 1
  from public.inventory_skus s
  join public.inventory_units_from_items(p_items) u on u.sku_id = s.id
  order by s.id
  for update of s;

  for rec in
    select s.id, s.product_name, s.size, s.current_stock,
      s.active, s.storefront_enabled, u.units
    from public.inventory_units_from_items(p_items) u
    join public.inventory_skus s on s.id = u.sku_id
    order by s.id
  loop
    select coalesce(sum(quantity), 0)::integer into v_reserved
    from public.inventory_reservations
    where sku_id = rec.id
      and status = 'active'
      and expires_at > now()
      and reservation_key <> p_reservation_key;

    if not rec.active or not rec.storefront_enabled
      or rec.current_stock - v_reserved < rec.units then
      raise exception '% % is no longer available in the requested quantity',
        rec.product_name, upper(rec.size);
    end if;

    insert into public.inventory_reservations (
      reservation_key, sku_id, quantity, status, expires_at, updated_at
    ) values (
      trim(p_reservation_key), rec.id, rec.units, 'active',
      now() + make_interval(secs => p_ttl_seconds), now()
    )
    on conflict (reservation_key, sku_id) do update set
      quantity = excluded.quantity,
      status = 'active',
      expires_at = excluded.expires_at,
      updated_at = now();
  end loop;

  return jsonb_build_object(
    'reservationKey', trim(p_reservation_key),
    'expiresAt', now() + make_interval(secs => p_ttl_seconds)
  );
end;
$$;

revoke all on function public.reserve_storefront_inventory(text, jsonb, integer) from public;
revoke all on function public.reserve_storefront_inventory(text, jsonb, integer) from anon;
revoke all on function public.reserve_storefront_inventory(text, jsonb, integer) from authenticated;
grant execute on function public.reserve_storefront_inventory(text, jsonb, integer) to service_role;

create or replace function public.release_storefront_inventory_reservation(
  p_reservation_key text,
  p_status text default 'released'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('released', 'converted') then
    raise exception 'Reservation status must be released or converted';
  end if;

  update public.inventory_reservations
  set status = p_status, updated_at = now()
  where reservation_key = p_reservation_key and status = 'active';
end;
$$;

revoke all on function public.release_storefront_inventory_reservation(text, text) from public;
revoke all on function public.release_storefront_inventory_reservation(text, text) from anon;
revoke all on function public.release_storefront_inventory_reservation(text, text) from authenticated;
grant execute on function public.release_storefront_inventory_reservation(text, text) to service_role;

create or replace function public.set_inventory_storefront_enabled(
  p_sku_id uuid,
  p_enabled boolean,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous boolean;
begin
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'A reason of at least 3 characters is required';
  end if;

  select storefront_enabled into v_previous
  from public.inventory_skus
  where id = p_sku_id
  for update;

  if not found then raise exception 'SKU not found'; end if;
  if v_previous = p_enabled then return p_enabled; end if;

  update public.inventory_skus
  set storefront_enabled = p_enabled
  where id = p_sku_id;

  insert into public.inventory_availability_changes (
    sku_id, previous_enabled, new_enabled, reason
  ) values (p_sku_id, v_previous, p_enabled, trim(p_reason));

  return p_enabled;
end;
$$;

revoke all on function public.set_inventory_storefront_enabled(uuid, boolean, text) from public;
revoke all on function public.set_inventory_storefront_enabled(uuid, boolean, text) from anon;
revoke all on function public.set_inventory_storefront_enabled(uuid, boolean, text) from authenticated;
grant execute on function public.set_inventory_storefront_enabled(uuid, boolean, text) to service_role;

-- Extend the existing paid-order trigger so a reservation is linked to its
-- order and released/converted automatically on payment outcome.
create or replace function public.orders_sync_inventory_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_order_inventory(old.id, old.order_number, old.items, false);
    if old.inventory_reservation_key is not null then
      perform public.release_storefront_inventory_reservation(old.inventory_reservation_key, 'released');
    end if;
    return old;
  end if;

  perform public.sync_order_inventory(
    new.id,
    new.order_number,
    new.items,
    new.payment_status = 'paid'
  );

  if new.inventory_reservation_key is not null then
    update public.inventory_reservations
    set order_id = new.id, updated_at = now()
    where reservation_key = new.inventory_reservation_key;

    if new.payment_status = 'paid' then
      perform public.release_storefront_inventory_reservation(new.inventory_reservation_key, 'converted');
    elsif new.payment_status = 'failed' then
      perform public.release_storefront_inventory_reservation(new.inventory_reservation_key, 'released');
    end if;
  end if;

  return new;
end;
$$;


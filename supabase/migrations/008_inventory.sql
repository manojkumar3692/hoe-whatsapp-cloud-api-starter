-- SKU inventory for every fragrance/size combination.
--
-- Stock is derived from an append-only movement ledger plus the cached
-- current_stock on inventory_skus.  An order allocation makes payment
-- updates idempotent: pending/failed orders consume nothing, changing an
-- order to paid consumes once, and changing it away from paid restores it.

create table if not exists public.inventory_skus (
  id uuid not null default gen_random_uuid(),
  sku text not null,
  product_key text not null,
  product_name text not null,
  size text not null,
  opening_stock integer not null default 0,
  current_stock integer not null default 0,
  low_stock_threshold integer not null default 5,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint inventory_skus_pkey primary key (id),
  constraint inventory_skus_sku_key unique (sku),
  constraint inventory_skus_product_size_key unique (product_key, size),
  constraint inventory_skus_opening_stock_check check (opening_stock >= 0),
  constraint inventory_skus_size_check check (size in ('8ml', '50ml'))
);

create table if not exists public.inventory_order_allocations (
  order_id uuid not null references public.orders(id) on delete cascade,
  sku_id uuid not null references public.inventory_skus(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  updated_at timestamp with time zone not null default now(),
  constraint inventory_order_allocations_pkey primary key (order_id, sku_id)
);

create table if not exists public.inventory_movements (
  id uuid not null default gen_random_uuid(),
  sku_id uuid not null references public.inventory_skus(id) on delete restrict,
  order_id uuid null references public.orders(id) on delete set null,
  order_number text null,
  movement_type text not null,
  quantity_delta integer not null check (quantity_delta <> 0),
  resulting_stock integer not null,
  reason text null,
  created_at timestamp with time zone not null default now(),
  constraint inventory_movements_pkey primary key (id),
  constraint inventory_movements_type_check check (
    movement_type in ('order_sale', 'order_restored', 'manual_adjustment', 'manual_override')
  )
);

-- Paid items that could not be mapped are surfaced to the admin instead of
-- silently disappearing from inventory calculations.
create table if not exists public.inventory_unmapped_items (
  id uuid not null default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_number text not null,
  item_index integer not null,
  item jsonb not null,
  reason text not null,
  created_at timestamp with time zone not null default now(),
  constraint inventory_unmapped_items_pkey primary key (id),
  constraint inventory_unmapped_items_order_item_key unique (order_id, item_index)
);

create index if not exists idx_inventory_movements_sku_created
  on public.inventory_movements (sku_id, created_at desc);
create index if not exists idx_inventory_movements_order
  on public.inventory_movements (order_id) where order_id is not null;

-- Inventory is admin/server-only. The storefront can keep writing orders;
-- the security-definer trigger below performs the stock reconciliation.
alter table public.inventory_skus enable row level security;
alter table public.inventory_order_allocations enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_unmapped_items enable row level security;

drop trigger if exists set_inventory_skus_updated_at on public.inventory_skus;
create trigger set_inventory_skus_updated_at
before update on public.inventory_skus
for each row execute function public.set_updated_at();

insert into public.inventory_skus
  (sku, product_key, product_name, size, opening_stock, current_stock, low_stock_threshold)
values
  ('DESERT-TONKA-8ML',  'desert-tonka', 'Desert Tonka', '8ml',  25, 25, 5),
  ('ARCTIC-WAVE-8ML',   'arctic-wave',  'Arctic Wave',  '8ml',  25, 25, 5),
  ('ZYROX-8ML',         'zyrox',        'Zyrox',        '8ml',  25, 25, 5),
  ('RANK-8ML',          'rank',         'RANK',         '8ml',  25, 25, 5),
  ('SYRA-8ML',          'syra',         'Syra',         '8ml',  25, 25, 5),
  ('SILENT-GOLD-8ML',   'silent-gold',  'Silent Gold',  '8ml',  25, 25, 5),
  ('DESERT-TONKA-50ML', 'desert-tonka', 'Desert Tonka', '50ml', 15, 15, 3),
  ('ARCTIC-WAVE-50ML',  'arctic-wave',  'Arctic Wave',  '50ml', 15, 15, 3),
  ('ZYROX-50ML',        'zyrox',        'Zyrox',        '50ml', 15, 15, 3),
  ('RANK-50ML',         'rank',         'RANK',         '50ml', 15, 15, 3),
  ('SYRA-50ML',         'syra',         'Syra',         '50ml', 15, 15, 3),
  ('SILENT-GOLD-50ML',  'silent-gold',  'Silent Gold',  '50ml', 15, 15, 3)
on conflict (sku) do nothing;

-- Convert the storefront's JSON order items into physical SKU usage.
-- Trial packs use one 8ML unit of each of the three fragrances named in
-- the line item. A normal line item uses its quantity of the matching size.
create or replace function public.inventory_units_from_items(p_items jsonb)
returns table (sku_id uuid, units integer)
language sql
stable
as $$
  with raw_items as (
    select
      item,
      case
        when coalesce(item->>'quantity', item->>'qty', '') ~ '^\d+$'
          then greatest(coalesce(item->>'quantity', item->>'qty')::integer, 0)
        else 1
      end as quantity,
      lower(coalesce(item->>'productId', item->>'product_id', item->>'slug', '')) as item_key,
      lower(coalesce(item->>'size', '')) as item_size,
      lower(coalesce(item->>'name', item->>'title', item->>'product_name', '')) as item_name
    from jsonb_array_elements(
      case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end
    ) as expanded(item)
  ),
  normal_items as (
    select s.id as sku_id, r.quantity as units
    from raw_items r
    join public.inventory_skus s
      on s.active
     and s.size = replace(r.item_size, ' ', '')
     and s.product_key = regexp_replace(
       regexp_replace(r.item_key, '-(unisex-|women-)?perfume$', ''),
       '-50ml$', ''
     )
    where r.item_key <> 'trial-pack'
      and replace(r.item_size, ' ', '') in ('8ml', '50ml')
  ),
  trial_items as (
    select s.id as sku_id, r.quantity as units
    from raw_items r
    join public.inventory_skus s
      on s.active
     and s.size = '8ml'
     and r.item_name like '%' || replace(s.product_key, '-', ' ') || '%'
    where r.item_key = 'trial-pack'
       or replace(r.item_size, ' ', '') in ('3x8ml', '3×8ml')
  ),
  all_usage as (
    select * from normal_items
    union all
    select * from trial_items
  )
  select sku_id, sum(units)::integer
  from all_usage
  where units > 0
  group by sku_id;
$$;

-- Reconcile one order to the stock it should consume right now. Comparing
-- with allocations prevents duplicate payment webhooks or repeated edits
-- from ever subtracting the same order twice.
create or replace function public.sync_order_inventory(
  p_order_id uuid,
  p_order_number text,
  p_items jsonb,
  p_is_paid boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_delta integer;
  v_stock integer;
begin
  delete from public.inventory_unmapped_items where order_id = p_order_id;

  if p_is_paid then
    insert into public.inventory_unmapped_items (order_id, order_number, item_index, item, reason)
    select
      p_order_id,
      p_order_number,
      expanded.item_index::integer,
      expanded.item,
      case
        when lower(coalesce(expanded.item->>'productId', expanded.item->>'product_id', expanded.item->>'slug', '')) = 'trial-pack'
          or replace(lower(coalesce(expanded.item->>'size', '')), ' ', '') in ('3x8ml', '3×8ml')
          then 'Trial pack did not match exactly three 8ML fragrance SKUs'
        else 'Paid item size/product did not match an active SKU'
      end
    from jsonb_array_elements(
      case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end
    ) with ordinality as expanded(item, item_index)
    where
      (
        (
          lower(coalesce(expanded.item->>'productId', expanded.item->>'product_id', expanded.item->>'slug', '')) = 'trial-pack'
          or replace(lower(coalesce(expanded.item->>'size', '')), ' ', '') in ('3x8ml', '3×8ml')
        )
        and (
          select count(*)
          from public.inventory_skus s
          where s.active
            and s.size = '8ml'
            and lower(coalesce(expanded.item->>'name', expanded.item->>'title', expanded.item->>'product_name', ''))
              like '%' || replace(s.product_key, '-', ' ') || '%'
        ) <> 3
      )
      or
      (
        not (
          lower(coalesce(expanded.item->>'productId', expanded.item->>'product_id', expanded.item->>'slug', '')) = 'trial-pack'
          or replace(lower(coalesce(expanded.item->>'size', '')), ' ', '') in ('3x8ml', '3×8ml')
        )
        and replace(lower(coalesce(expanded.item->>'size', '')), ' ', '') in ('8ml', '50ml')
        and not exists (
          select 1
          from public.inventory_skus s
          where s.active
            and s.size = replace(lower(coalesce(expanded.item->>'size', '')), ' ', '')
            and s.product_key = regexp_replace(
              regexp_replace(
                lower(coalesce(expanded.item->>'productId', expanded.item->>'product_id', expanded.item->>'slug', '')),
                '-(unisex-|women-)?perfume$',
                ''
              ),
              '-50ml$',
              ''
            )
        )
      );
  end if;

  for rec in
    with desired as (
      select sku_id, units
      from public.inventory_units_from_items(p_items)
      where p_is_paid
    ),
    affected as (
      select sku_id from desired
      union
      select sku_id from public.inventory_order_allocations where order_id = p_order_id
    )
    select
      a.sku_id,
      coalesce(alloc.quantity, 0) as old_units,
      coalesce(d.units, 0) as desired_units
    from affected a
    left join desired d on d.sku_id = a.sku_id
    left join public.inventory_order_allocations alloc
      on alloc.order_id = p_order_id and alloc.sku_id = a.sku_id
  loop
    -- Stock delta is inverse usage: selling 2 means -2; restoring means +2.
    v_delta := rec.old_units - rec.desired_units;

    if v_delta <> 0 then
      update public.inventory_skus
      set current_stock = current_stock + v_delta
      where id = rec.sku_id
      returning current_stock into v_stock;

      insert into public.inventory_movements (
        sku_id, order_id, order_number, movement_type,
        quantity_delta, resulting_stock, reason
      ) values (
        rec.sku_id,
        p_order_id,
        p_order_number,
        case when v_delta < 0 then 'order_sale' else 'order_restored' end,
        v_delta,
        v_stock,
        case when v_delta < 0
          then 'Paid order stock deduction'
          else 'Order is no longer paid or its items changed'
        end
      );
    end if;

    if rec.desired_units > 0 then
      insert into public.inventory_order_allocations (order_id, sku_id, quantity, updated_at)
      values (p_order_id, rec.sku_id, rec.desired_units, now())
      on conflict (order_id, sku_id) do update
        set quantity = excluded.quantity, updated_at = excluded.updated_at;
    else
      delete from public.inventory_order_allocations
      where order_id = p_order_id and sku_id = rec.sku_id;
    end if;
  end loop;
end;
$$;

revoke all on function public.sync_order_inventory(uuid, text, jsonb, boolean) from public;
revoke all on function public.sync_order_inventory(uuid, text, jsonb, boolean) from anon;
revoke all on function public.sync_order_inventory(uuid, text, jsonb, boolean) from authenticated;

create or replace function public.orders_sync_inventory_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_order_inventory(old.id, old.order_number, old.items, false);
    return old;
  end if;

  perform public.sync_order_inventory(
    new.id,
    new.order_number,
    new.items,
    new.payment_status = 'paid'
  );
  return new;
end;
$$;

revoke all on function public.orders_sync_inventory_trigger() from public;
revoke all on function public.orders_sync_inventory_trigger() from anon;
revoke all on function public.orders_sync_inventory_trigger() from authenticated;

drop trigger if exists orders_sync_inventory on public.orders;
create trigger orders_sync_inventory
after insert or update of payment_status, items on public.orders
for each row execute function public.orders_sync_inventory_trigger();

drop trigger if exists orders_restore_inventory_before_delete on public.orders;
create trigger orders_restore_inventory_before_delete
before delete on public.orders
for each row execute function public.orders_sync_inventory_trigger();

-- Atomic manual adjustment/absolute override used by the Inventory page.
create or replace function public.adjust_inventory(
  p_sku_id uuid,
  p_mode text,
  p_quantity integer,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current integer;
  v_delta integer;
  v_result integer;
begin
  if p_mode not in ('adjust', 'set') then
    raise exception 'Mode must be adjust or set';
  end if;
  if p_mode = 'set' and p_quantity < 0 then
    raise exception 'Stock count cannot be negative';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'A reason of at least 3 characters is required';
  end if;

  select current_stock into v_current
  from public.inventory_skus
  where id = p_sku_id
  for update;

  if not found then raise exception 'SKU not found'; end if;

  v_delta := case when p_mode = 'set' then p_quantity - v_current else p_quantity end;
  if v_delta = 0 then return v_current; end if;

  update public.inventory_skus
  set current_stock = current_stock + v_delta
  where id = p_sku_id
  returning current_stock into v_result;

  insert into public.inventory_movements (
    sku_id, movement_type, quantity_delta, resulting_stock, reason
  ) values (
    p_sku_id,
    case when p_mode = 'set' then 'manual_override' else 'manual_adjustment' end,
    v_delta,
    v_result,
    trim(p_reason)
  );

  return v_result;
end;
$$;

revoke all on function public.adjust_inventory(uuid, text, integer, text) from public;
revoke all on function public.adjust_inventory(uuid, text, integer, text) from anon;
revoke all on function public.adjust_inventory(uuid, text, integer, text) from authenticated;
grant execute on function public.adjust_inventory(uuid, text, integer, text) to service_role;

-- Backfill all existing paid orders. Safe on repeat because allocations
-- record exactly what has already been deducted for every order/SKU.
do $$
declare
  o record;
begin
  for o in select id, order_number, items from public.orders where payment_status = 'paid' loop
    perform public.sync_order_inventory(o.id, o.order_number, o.items, true);
  end loop;
end;
$$;

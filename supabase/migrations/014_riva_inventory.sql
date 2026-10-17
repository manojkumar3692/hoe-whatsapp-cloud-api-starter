-- RIVA: 8ml Discovery Set units and 50ml bottles.
-- Apply after 010. Confirmed opening balances: 10 x 8ml and 5 x 50ml.
-- Existing paid RIVA orders deduct from these balances. Existing SKU counts
-- are preserved on reruns. Enter dated unit costs in Accounts > Product costing.
begin;

insert into public.inventory_skus
  (sku, product_key, product_name, size, opening_stock, current_stock, low_stock_threshold)
values
  ('RIVA-8ML', 'riva', 'RIVA', '8ml', 10, 10, 5),
  ('RIVA-50ML', 'riva', 'RIVA', '50ml', 5, 5, 3)
on conflict (product_key, size) do nothing;

-- The storefront can persist items as an array or a JSON-encoded string.
-- Use the same normalization for reservations, allocation and unmapped checks.
create or replace function public.inventory_parse_items(p_items jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
begin
  if jsonb_typeof(p_items) = 'string' then
    begin
      p_items := (p_items #>> '{}')::jsonb;
    exception when invalid_text_representation then
      return '[]'::jsonb;
    end;
  end if;
  return case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end;
end;
$$;

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
      public.inventory_parse_items(p_items)
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
  p_items := public.inventory_parse_items(p_items);
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
  p_items := public.inventory_parse_items(p_items);
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

-- Reconcile only orders containing RIVA, including Trial Packs. Allocations
-- make reruns safe: existing sales are never deducted twice. A negative stock
-- here means historical sales exceed the confirmed opening balance.
do $$
declare
  o record;
begin
  for o in
    select id, order_number, items from public.orders
    where payment_status = 'paid'
      and exists (
        select 1 from jsonb_array_elements(public.inventory_parse_items(items)) as entry(item)
        where lower(coalesce(item->>'productId', item->>'product_id', item->>'slug', ''))
                in ('riva', 'riva-women-perfume', 'riva-perfume', 'riva-50ml')
           or lower(coalesce(item->>'name', item->>'title', item->>'product_name', ''))
                ~ '\mriva\M'
      )
  loop
    perform public.sync_order_inventory(o.id, o.order_number, o.items, true);
  end loop;
end;
$$;

commit;

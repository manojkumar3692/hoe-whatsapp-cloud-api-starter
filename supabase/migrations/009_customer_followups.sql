-- Post-delivery customer feedback and sales follow-up workflow.
-- A follow-up is created once an order is fully paid and delivered. The
-- unique order_id makes courier re-syncs and repeated admin edits idempotent.

create table if not exists public.customer_followups (
  id uuid not null default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid null references public.customers(id) on delete set null,
  followup_type text not null default 'regular_purchase',
  status text not null default 'due',
  delivered_at timestamp with time zone not null,
  due_at timestamp with time zone not null,
  next_action_at timestamp with time zone null,
  attempt_count integer not null default 0,
  rating integer null,
  feedback_outcome text null,
  favorite_perfumes text[] not null default '{}'::text[],
  longevity_feedback text null,
  fragrance_strength text null,
  purchase_interest text null,
  preferred_bottle_size text null,
  customer_feedback text null,
  internal_notes text null,
  next_action text null,
  completed_at timestamp with time zone null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint customer_followups_pkey primary key (id),
  constraint customer_followups_order_key unique (order_id),
  constraint customer_followups_rating_check check (rating is null or rating between 1 and 5),
  constraint customer_followups_type_check check (followup_type in ('trial_pack', 'regular_purchase')),
  constraint customer_followups_status_check check (
    status in ('due', 'in_progress', 'call_later', 'awaiting_reply', 'interested',
      'issue', 'completed', 'no_response', 'not_interested', 'cancelled')
  )
);

create table if not exists public.customer_followup_attempts (
  id uuid not null default gen_random_uuid(),
  followup_id uuid not null references public.customer_followups(id) on delete cascade,
  method text not null,
  result text not null,
  notes text null,
  next_attempt_at timestamp with time zone null,
  created_at timestamp with time zone not null default now(),
  constraint customer_followup_attempts_pkey primary key (id),
  constraint customer_followup_attempts_method_check check (method in ('call', 'whatsapp')),
  constraint customer_followup_attempts_result_check check (
    result in ('answered', 'no_answer', 'busy', 'callback_requested', 'message_sent', 'customer_replied')
  )
);

create index if not exists idx_customer_followups_queue
  on public.customer_followups (status, next_action_at, due_at);
create index if not exists idx_customer_followups_customer
  on public.customer_followups (customer_id, created_at desc);
create index if not exists idx_customer_followup_attempts_followup
  on public.customer_followup_attempts (followup_id, created_at desc);

drop trigger if exists set_customer_followups_updated_at on public.customer_followups;
create trigger set_customer_followups_updated_at
before update on public.customer_followups
for each row execute function public.set_updated_at();

-- The storefront sometimes stores items as a JSON string inside the jsonb
-- column. Text matching intentionally supports both that and a native array.
create or replace function public.order_followup_type(p_items jsonb)
returns text
language sql
immutable
as $$
  select case
    when lower(coalesce(p_items::text, '')) like '%trial-pack%'
      or lower(coalesce(p_items::text, '')) like '%trial pack%'
      or lower(coalesce(p_items::text, '')) like '%3x8ml%'
      or lower(coalesce(p_items::text, '')) like '%3×8ml%'
    then 'trial_pack'
    else 'regular_purchase'
  end;
$$;

create or replace function public.sync_customer_followup_for_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fully_paid boolean;
  v_eligible boolean;
  v_delivered_at timestamp with time zone;
  v_customer_id uuid;
begin
  v_fully_paid := new.payment_status = 'paid'
    and (new.payment_type <> 'partial_cod' or new.cod_balance_status = 'collected');
  v_eligible := v_fully_paid
    and new.shipping_status in ('delivered', 'completed')
    and coalesce(new.is_hidden, false) = false;

  if v_eligible then
    select min(h.created_at) into v_delivered_at
    from public.order_status_history h
    where h.order_id = new.id and h.status in ('delivered', 'completed');

    v_delivered_at := coalesce(v_delivered_at, now());

    select c.id into v_customer_id
    from public.customers c
    where regexp_replace(c.phone, '[^0-9]', '', 'g') = regexp_replace(new.customer_phone, '[^0-9]', '', 'g')
    order by c.created_at asc
    limit 1;

    insert into public.customer_followups (
      order_id, customer_id, followup_type, delivered_at, due_at, next_action_at
    ) values (
      new.id, v_customer_id, public.order_followup_type(new.items),
      v_delivered_at, v_delivered_at + interval '2 days', v_delivered_at + interval '2 days'
    )
    on conflict (order_id) do update set
      customer_id = coalesce(customer_followups.customer_id, excluded.customer_id),
      followup_type = excluded.followup_type,
      status = case when customer_followups.status = 'cancelled' then 'due' else customer_followups.status end,
      delivered_at = case when customer_followups.status = 'cancelled' then excluded.delivered_at else customer_followups.delivered_at end,
      due_at = case when customer_followups.status = 'cancelled' then excluded.due_at else customer_followups.due_at end,
      next_action_at = case when customer_followups.status = 'cancelled' then excluded.next_action_at else customer_followups.next_action_at end,
      next_action = case when customer_followups.status = 'cancelled' then null else customer_followups.next_action end;
  else
    update public.customer_followups
    set status = 'cancelled', next_action_at = null,
        next_action = 'Order is no longer eligible for post-delivery follow-up'
    where order_id = new.id
      and status not in ('completed', 'no_response', 'not_interested', 'cancelled');
  end if;

  return new;
end;
$$;

drop trigger if exists orders_sync_customer_followup on public.orders;
create trigger orders_sync_customer_followup
after insert or update of payment_status, payment_type, cod_balance_status, shipping_status, items, is_hidden
on public.orders
for each row execute function public.sync_customer_followup_for_order();

-- Backfill eligible historical orders. Their earliest delivered/completed
-- history time is used when available, otherwise the order's last update.
insert into public.customer_followups (
  order_id, customer_id, followup_type, delivered_at, due_at, next_action_at
)
select
  o.id,
  (
    select c.id from public.customers c
    where regexp_replace(c.phone, '[^0-9]', '', 'g') = regexp_replace(o.customer_phone, '[^0-9]', '', 'g')
    order by c.created_at asc limit 1
  ),
  public.order_followup_type(o.items),
  coalesce(
    (select min(h.created_at) from public.order_status_history h
      where h.order_id = o.id and h.status in ('delivered', 'completed')),
    o.updated_at
  ),
  coalesce(
    (select min(h.created_at) from public.order_status_history h
      where h.order_id = o.id and h.status in ('delivered', 'completed')),
    o.updated_at
  ) + interval '2 days',
  coalesce(
    (select min(h.created_at) from public.order_status_history h
      where h.order_id = o.id and h.status in ('delivered', 'completed')),
    o.updated_at
  ) + interval '2 days'
from public.orders o
where o.payment_status = 'paid'
  and (o.payment_type <> 'partial_cod' or o.cod_balance_status = 'collected')
  and o.shipping_status in ('delivered', 'completed')
  and coalesce(o.is_hidden, false) = false
on conflict (order_id) do nothing;

-- Browser subscriptions and a durable queue of first confirmed payments.
-- Apply after 005_order_hidden.sql. No historical orders are backfilled.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  keys jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create table if not exists public.order_push_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed')),
  created_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts integer not null default 0,
  last_error text
);
create index if not exists order_push_events_pending on public.order_push_events(status, available_at);
create table if not exists public.order_push_receipts (
  event_id uuid not null references public.order_push_events(id) on delete cascade,
  endpoint text not null,
  primary key(event_id, endpoint)
);

alter table public.push_subscriptions enable row level security;
alter table public.order_push_events enable row level security;
alter table public.order_push_receipts enable row level security;
revoke all on public.push_subscriptions, public.order_push_events, public.order_push_receipts from anon, authenticated;
grant all on public.push_subscriptions, public.order_push_events, public.order_push_receipts to service_role;

create or replace function public.enqueue_paid_order_push()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.payment_status = 'paid' and not coalesce(new.is_hidden, false) then
    if TG_OP = 'INSERT' then
      insert into public.order_push_events(order_id) values(new.id) on conflict(order_id) do nothing;
    elsif old.payment_status is distinct from 'paid' then
      insert into public.order_push_events(order_id) values(new.id) on conflict(order_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enqueue_paid_order_push() from public, anon, authenticated;
drop trigger if exists enqueue_paid_order_push on public.orders;
create trigger enqueue_paid_order_push after insert or update of payment_status on public.orders
for each row execute function public.enqueue_paid_order_push();

create or replace function public.claim_order_push_events()
returns setof public.order_push_events language sql security definer set search_path = '' as $$
  update public.order_push_events e
  set status = 'processing', claimed_at = now(), attempts = e.attempts + 1
  where e.id in (
    select q.id from public.order_push_events q
    where q.created_at > now() - interval '24 hours' and q.attempts < 8 and (
      (q.status = 'pending' and q.available_at <= now()) or
      (q.status = 'processing' and q.claimed_at < now() - interval '5 minutes')
    )
    order by q.created_at limit 5 for update skip locked
  ) returning e.*;
$$;
revoke all on function public.claim_order_push_events() from public, anon, authenticated;
grant execute on function public.claim_order_push_events() to service_role;

-- After applying this migration, configure a Supabase Database Webhook:
-- Table: public.order_push_events; event: INSERT; method: POST
-- URL: https://YOUR_DASHBOARD/api/push/dispatch
-- Header: Authorization: Bearer <PUSH_WEBHOOK_SECRET>
-- A scheduled authenticated GET to the same URL retries transient failures.

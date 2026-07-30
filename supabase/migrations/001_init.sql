-- HOUSE OF EON WhatsApp Cloud API Starter
-- Full schema snapshot, kept in sync with the live Supabase project.
-- Safe to re-run: every statement is idempotent.

-- ============================================================
-- customers
-- ============================================================
create table if not exists public.customers (
  id uuid not null default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text null,
  product text null,
  city text null,
  source text not null default 'csv'::text,
  consent boolean not null default true,
  tags text[] not null default '{}'::text[],
  last_order_date date null,
  last_message_at timestamp with time zone null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  last_campaign_name text null,
  last_campaign_at timestamp with time zone null,
  marketing_fail_count integer not null default 0,
  last_marketing_fail_reason text null,
  last_marketing_fail_at timestamp with time zone null,
  marketing_cooldown_until timestamp with time zone null,
  marketing_health text not null default 'healthy'::text,
  opt_out boolean not null default false,
  blocked boolean not null default false,
  total_replies integer not null default 0,
  total_campaigns integer not null default 0,
  total_orders integer not null default 0,
  lifetime_value_in_paise bigint not null default 0,
  constraint customers_pkey primary key (id),
  constraint customers_phone_key unique (phone)
);

create index if not exists idx_customers_phone on public.customers using btree (phone);
create index if not exists idx_customers_marketing_health on public.customers using btree (marketing_health);
create index if not exists idx_customers_marketing_cooldown_until on public.customers using btree (marketing_cooldown_until);

-- ============================================================
-- campaigns
-- ============================================================
create table if not exists public.campaigns (
  id uuid not null default gen_random_uuid(),
  name text not null,
  template_name text not null,
  total_recipients integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  status text not null default 'draft'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  coupon_code text null,
  product text null,
  header_image_url text null,
  estimated_cost_in_paise integer not null default 0,
  constraint campaigns_pkey primary key (id)
);

-- ============================================================
-- campaign_recipients
-- ============================================================
create table if not exists public.campaign_recipients (
  id uuid not null default gen_random_uuid(),
  campaign_id uuid not null,
  customer_id uuid null,
  name text not null,
  phone text not null,
  product text null,
  city text null,
  status text not null default 'ready'::text,
  reason text null,
  created_at timestamp with time zone not null default now(),
  constraint campaign_recipients_pkey primary key (id),
  constraint campaign_recipients_campaign_id_fkey foreign key (campaign_id) references public.campaigns (id) on delete cascade,
  constraint campaign_recipients_customer_id_fkey foreign key (customer_id) references public.customers (id) on delete set null
);

create index if not exists idx_campaign_recipients_campaign_id on public.campaign_recipients using btree (campaign_id);
create index if not exists idx_campaign_recipients_phone on public.campaign_recipients using btree (phone);

-- ============================================================
-- message_logs
-- ============================================================
create table if not exists public.message_logs (
  id uuid not null default gen_random_uuid(),
  customer_id uuid null,
  phone text not null,
  direction text not null default 'outbound'::text,
  status text not null default 'pending'::text,
  template_name text null,
  body text null,
  meta_message_id text null,
  error text null,
  raw_response jsonb null,
  created_at timestamp with time zone not null default now(),
  campaign_id uuid null,
  constraint message_logs_pkey primary key (id),
  constraint message_logs_campaign_id_fkey foreign key (campaign_id) references public.campaigns (id) on delete set null,
  constraint message_logs_customer_id_fkey foreign key (customer_id) references public.customers (id) on delete set null
);

create index if not exists idx_message_logs_phone on public.message_logs using btree (phone);
create index if not exists idx_message_logs_created_at on public.message_logs using btree (created_at);
create index if not exists idx_message_logs_campaign_id on public.message_logs using btree (campaign_id);

-- ============================================================
-- shared trigger function for updated_at columns
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- orders
-- ============================================================
create table if not exists public.orders (
  id uuid not null default gen_random_uuid(),
  order_number text not null,
  customer_name text not null,
  customer_phone text not null,
  customer_email text null,
  customer_address text not null,
  customer_city text null,
  customer_state text null,
  customer_pincode text null,
  items jsonb not null,
  amount_in_paise integer not null,
  payment_status text not null default 'pending'::text,
  razorpay_order_id text null,
  razorpay_payment_id text null,
  shipping_status text not null default 'pending'::text,
  tracking_url text null,
  notes text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  coupon_code text null,
  subtotal_in_paise integer null,
  coupon_discount_in_paise integer null,
  payment_type text not null default 'full'::text,
  token_amount_in_paise integer not null default 0,
  balance_due_in_paise integer not null default 0,
  cod_balance_status text not null default 'not_applicable'::text,
  constraint orders_pkey primary key (id),
  constraint orders_order_number_key unique (order_number),
  constraint orders_razorpay_order_id_key unique (razorpay_order_id),
  constraint orders_cod_balance_status_check check (
    cod_balance_status = any (array['not_applicable'::text, 'pending'::text, 'collected'::text])
  ),
  constraint orders_payment_type_check check (
    payment_type = any (array['full'::text, 'partial_cod'::text])
  )
);

create index if not exists idx_orders_order_number on public.orders using btree (order_number);
create index if not exists idx_orders_phone on public.orders using btree (customer_phone);
create index if not exists idx_orders_payment_status on public.orders using btree (payment_status);
create index if not exists idx_orders_cod_balance_status on public.orders using btree (cod_balance_status)
  where (cod_balance_status = 'pending'::text);

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row
execute function public.set_updated_at();

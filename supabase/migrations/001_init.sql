create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text unique not null,
  product text,
  city text,
  source text default 'past_orders',
  consent boolean default true,
  tags text[] default '{}',
  last_order_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_name text not null,
  language_code text not null default 'en',
  created_at timestamptz default now()
);
create table if not exists message_logs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  phone text not null,
  direction text not null check (direction in ('outbound','inbound','status')),
  template_name text,
  whatsapp_message_id text,
  status text default 'queued',
  body text,
  raw jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_message_logs_phone on message_logs(phone);
create index if not exists idx_message_logs_wamid on message_logs(whatsapp_message_id);

-- Server-only accounts ledger. Amounts are integer paise, quantities thousandths.
create table if not exists public.finance_bills (
  id uuid primary key,
  supplier text not null check (length(trim(supplier)) between 1 and 200),
  supplier_gstin text,
  invoice_number text not null check (length(trim(invoice_number)) between 1 and 100),
  invoice_date date not null,
  due_date date check (due_date >= invoice_date),
  service_month text not null check (service_month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  category text not null check (category in ('materials','meta_ads','advertising','shipping','payment_fees','rent','other')),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 100),
  subtotal_paise bigint not null check (subtotal_paise >= 0),
  cgst_paise bigint not null default 0 check (cgst_paise >= 0),
  sgst_paise bigint not null default 0 check (sgst_paise >= 0),
  igst_paise bigint not null default 0 check (igst_paise >= 0),
  total_paise bigint not null check (total_paise > 0 and total_paise <= 100000000000),
  itc_status text not null default 'pending' check (itc_status in ('pending','eligible','ineligible')),
  itc_note text not null default '',
  notes text not null default '',
  document_path text,
  version integer not null default 1,
  voided boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_paise = subtotal_paise + cgst_paise + sgst_paise + igst_paise),
  check (igst_paise = 0 or (cgst_paise = 0 and sgst_paise = 0)),
  check (itc_status <> 'eligible' or (supplier_gstin is not null and length(itc_note) >= 5))
);
create unique index if not exists finance_bill_invoice_unique on public.finance_bills
  (lower(coalesce(supplier_gstin, trim(supplier))), lower(trim(invoice_number)), extract(year from invoice_date)) where not voided;
create index if not exists finance_bill_month on public.finance_bills (service_month, invoice_date);

create table if not exists public.finance_bill_payments (
  id uuid primary key,
  bill_id uuid not null references public.finance_bills(id),
  paid_on date not null,
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 100000000000),
  reference text not null check (length(trim(reference)) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists finance_payment_bill on public.finance_bill_payments(bill_id);
create table if not exists public.finance_audit (
  id bigint generated always as identity primary key,
  entity_id uuid not null,
  action text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.finance_product_costs (
  id uuid primary key,
  sku_id uuid not null references public.inventory_skus(id),
  effective_from date not null,
  components jsonb not null check (jsonb_typeof(components) = 'array' and jsonb_array_length(components) between 1 and 100),
  unit_cost_paise bigint not null check (unit_cost_paise > 0 and unit_cost_paise <= 100000000000),
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique(sku_id, effective_from)
);
create table if not exists public.finance_meta_daily (
  account_id text not null,
  campaign_id text not null,
  campaign_name text not null,
  day date not null,
  spend_paise bigint not null check (spend_paise >= 0),
  impressions bigint not null check (impressions >= 0),
  clicks bigint not null check (clicks >= 0),
  purchases numeric not null check (purchases >= 0),
  purchase_value_paise bigint not null check (purchase_value_paise >= 0),
  primary key(account_id, campaign_id, day)
);
create table if not exists public.finance_meta_campaigns (
  account_id text not null,
  campaign_id text not null,
  name text not null,
  effective_status text not null,
  daily_budget_paise bigint,
  lifetime_budget_paise bigint,
  objective text not null,
  primary key(account_id, campaign_id)
);
create table if not exists public.finance_meta_syncs (
  account_id text not null,
  month text not null,
  through_date date not null,
  synced_at timestamptz not null,
  account_name text not null,
  currency text not null,
  timezone text not null,
  primary key(account_id, month)
);

do $$ declare t text; begin
  foreach t in array array['finance_bills','finance_bill_payments','finance_audit','finance_product_costs','finance_meta_daily','finance_meta_campaigns','finance_meta_syncs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
grant usage, select on sequence public.finance_audit_id_seq to service_role;

create or replace function public.finance_line_total(p_items jsonb) returns bigint
language plpgsql immutable set search_path = public as $$
declare v_total numeric := 0; item jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Invalid line items'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if coalesce(item->>'quantity_milli','') !~ '^[0-9]+$' or coalesce(item->>'unit_cost_paise','') !~ '^[0-9]+$'
      or (item->>'quantity_milli')::numeric not between 1 and 1000000000
      or (item->>'unit_cost_paise')::numeric not between 0 and 100000000000
      or length(coalesce(item->>'description','')) not between 1 and 200 then raise exception 'Invalid line item'; end if;
    v_total := v_total + round((item->>'quantity_milli')::numeric * (item->>'unit_cost_paise')::numeric / 1000);
  end loop;
  if v_total > 100000000000 then raise exception 'Total too large'; end if;
  return v_total::bigint;
end $$;

create or replace function public.finance_save_bill(p_id uuid, p_expected_version integer, p_bill jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_old finance_bills; v_new finance_bills; v_paid bigint; v_total bigint;
begin
  -- Serialize creation/retry as well as edits and payment writes for this bill.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into v_old from finance_bills where id = p_id for update;
  if found then
    if v_old.version <> p_expected_version or v_old.voided then raise exception 'Bill changed. Reload before saving.'; end if;
  elsif p_expected_version <> 0 then raise exception 'Bill not found'; end if;
  v_new := jsonb_populate_record(null::finance_bills, p_bill);
  v_total := finance_line_total(v_new.items);
  if v_total <> v_new.subtotal_paise then raise exception 'Invoice subtotal mismatch'; end if;
  select coalesce(sum(amount_paise),0) into v_paid from finance_bill_payments where bill_id = p_id;
  if v_paid > v_new.total_paise then raise exception 'Invoice total cannot be below recorded payments'; end if;
  if v_new.document_path is not null and v_new.document_path not like p_id::text || '/%' then raise exception 'Invalid attachment path'; end if;
  insert into finance_bills (id,supplier,supplier_gstin,invoice_number,invoice_date,due_date,service_month,category,items,subtotal_paise,cgst_paise,sgst_paise,igst_paise,total_paise,itc_status,itc_note,notes,document_path)
  values (p_id,v_new.supplier,v_new.supplier_gstin,v_new.invoice_number,v_new.invoice_date,v_new.due_date,v_new.service_month,v_new.category,v_new.items,v_new.subtotal_paise,v_new.cgst_paise,v_new.sgst_paise,v_new.igst_paise,v_new.total_paise,v_new.itc_status,v_new.itc_note,v_new.notes,coalesce(v_new.document_path,v_old.document_path))
  on conflict (id) do update set supplier=excluded.supplier,supplier_gstin=excluded.supplier_gstin,invoice_number=excluded.invoice_number,invoice_date=excluded.invoice_date,due_date=excluded.due_date,service_month=excluded.service_month,category=excluded.category,items=excluded.items,subtotal_paise=excluded.subtotal_paise,cgst_paise=excluded.cgst_paise,sgst_paise=excluded.sgst_paise,igst_paise=excluded.igst_paise,total_paise=excluded.total_paise,itc_status=excluded.itc_status,itc_note=excluded.itc_note,notes=excluded.notes,document_path=excluded.document_path,version=finance_bills.version+1,updated_at=now();
  insert into finance_audit(entity_id,action,snapshot) select p_id,case when v_old.id is null then 'bill_created' else 'bill_updated' end,jsonb_build_object('before',to_jsonb(v_old),'after',to_jsonb(b)) from finance_bills b where id=p_id;
  return p_id;
end $$;

create or replace function public.finance_record_payment(p_id uuid,p_bill_id uuid,p_paid_on date,p_amount_paise bigint,p_reference text)
returns uuid language plpgsql security definer set search_path = public as $$
declare b finance_bills; paid bigint; existing finance_bill_payments;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_bill_id::text, 0));
  select * into b from finance_bills where id=p_bill_id for update;
  if not found or b.voided then raise exception 'Active bill not found'; end if;
  select * into existing from finance_bill_payments where id=p_id;
  if found then
    if existing.bill_id = p_bill_id and existing.paid_on = p_paid_on and existing.amount_paise = p_amount_paise and existing.reference = p_reference then return p_id; end if;
    raise exception 'Payment retry does not match original';
  end if;
  if p_paid_on > (now() at time zone 'Asia/Kolkata')::date then raise exception 'Payment date cannot be in the future'; end if;
  select coalesce(sum(amount_paise),0) into paid from finance_bill_payments where bill_id=p_bill_id;
  if paid+p_amount_paise > b.total_paise then raise exception 'Payment exceeds outstanding balance'; end if;
  insert into finance_bill_payments(id,bill_id,paid_on,amount_paise,reference) values(p_id,p_bill_id,p_paid_on,p_amount_paise,p_reference);
  insert into finance_audit(entity_id,action,snapshot) values(p_bill_id,'payment_recorded',jsonb_build_object('id',p_id,'amount_paise',p_amount_paise,'paid_on',p_paid_on,'reference',p_reference));
  return p_id;
end $$;

create or replace function public.finance_add_cost(p_id uuid,p_sku_id uuid,p_effective_from date,p_components jsonb,p_notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare amount bigint; existing finance_product_costs;
begin
  amount := finance_line_total(p_components);
  select * into existing from finance_product_costs where id=p_id;
  if found then
    if existing.sku_id=p_sku_id and existing.effective_from=p_effective_from and existing.components=p_components and existing.notes=p_notes then return p_id; end if;
    raise exception 'Cost retry does not match original';
  end if;
  insert into finance_product_costs(id,sku_id,effective_from,components,unit_cost_paise,notes) values(p_id,p_sku_id,p_effective_from,p_components,amount,p_notes);
  insert into finance_audit(entity_id,action,snapshot) values(p_id,'cost_version_created',jsonb_build_object('sku_id',p_sku_id,'effective_from',p_effective_from,'components',p_components,'unit_cost_paise',amount));
  return p_id;
end $$;

-- Replacing the requested month and current campaign snapshot is atomic.
-- A failed API page never reaches this function. Re-sync removes stale rows.
create or replace function public.finance_commit_meta(p_account text,p_month text,p_through date,p_started timestamptz,p_name text,p_currency text,p_timezone text,p_daily jsonb,p_campaigns jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('meta:'||p_account,0));
  if p_currency <> 'INR' or p_timezone not in ('Asia/Kolkata','Asia/Calcutta') then raise exception 'Ad account must use INR and India time'; end if;
  if p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or to_char(p_through,'YYYY-MM') <> p_month then raise exception 'Invalid sync period'; end if;
  if exists(select 1 from finance_meta_syncs where account_id=p_account and synced_at>p_started) then raise exception 'A newer sync already completed. Refresh the page.'; end if;
  if exists(select 1 from jsonb_array_elements(p_daily) r where r->>'account_id'<>p_account or (r->>'day')::date < (p_month||'-01')::date or (r->>'day')::date > p_through) then raise exception 'Insights outside requested period'; end if;
  if exists(select 1 from jsonb_array_elements(p_campaigns) r where r->>'account_id' is distinct from p_account) then raise exception 'Campaign account mismatch'; end if;
  delete from finance_meta_daily where account_id=p_account and day >= (p_month||'-01')::date and day < ((p_month||'-01')::date + interval '1 month');
  insert into finance_meta_daily select * from jsonb_populate_recordset(null::finance_meta_daily,p_daily);
  delete from finance_meta_campaigns where account_id=p_account;
  insert into finance_meta_campaigns select * from jsonb_populate_recordset(null::finance_meta_campaigns,p_campaigns);
  insert into finance_meta_syncs(account_id,month,through_date,synced_at,account_name,currency,timezone) values(p_account,p_month,p_through,p_started,p_name,p_currency,p_timezone)
  on conflict(account_id,month) do update set through_date=excluded.through_date,synced_at=excluded.synced_at,account_name=excluded.account_name,currency=excluded.currency,timezone=excluded.timezone;
end $$;

revoke all on function public.finance_line_total(jsonb) from public,anon,authenticated;
revoke all on function public.finance_save_bill(uuid,integer,jsonb) from public,anon,authenticated;
revoke all on function public.finance_record_payment(uuid,uuid,date,bigint,text) from public,anon,authenticated;
revoke all on function public.finance_add_cost(uuid,uuid,date,jsonb,text) from public,anon,authenticated;
revoke all on function public.finance_commit_meta(text,text,date,timestamptz,text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.finance_save_bill(uuid,integer,jsonb) to service_role;
grant execute on function public.finance_record_payment(uuid,uuid,date,bigint,text) to service_role;
grant execute on function public.finance_add_cost(uuid,uuid,date,jsonb,text) to service_role;
grant execute on function public.finance_commit_meta(text,text,date,timestamptz,text,text,text,jsonb,jsonb) to service_role;

-- Private supplier invoice storage. No public/object policies are granted.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('accounting-documents','accounting-documents',false,5242880,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

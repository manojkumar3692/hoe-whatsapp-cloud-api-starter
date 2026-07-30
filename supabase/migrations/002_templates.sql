-- Local cache of WhatsApp message templates created/submitted from this app.
-- Meta remains the source of truth for approval; this table just avoids
-- re-fetching from the Graph API on every page load.

create table if not exists public.whatsapp_templates (
  id uuid not null default gen_random_uuid(),
  meta_template_id text null,
  name text not null,
  category text not null,
  language text not null default 'en'::text,
  status text not null default 'PENDING'::text,
  components jsonb not null,
  rejected_reason text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint whatsapp_templates_pkey primary key (id),
  constraint whatsapp_templates_name_language_key unique (name, language)
);

create index if not exists idx_whatsapp_templates_status on public.whatsapp_templates using btree (status);

-- reuses the set_updated_at() function created in 001_init.sql
drop trigger if exists set_whatsapp_templates_updated_at on public.whatsapp_templates;
create trigger set_whatsapp_templates_updated_at
before update on public.whatsapp_templates
for each row
execute function public.set_updated_at();

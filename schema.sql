-- 1. Each clinic
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  wa_phone_number_id text unique not null,
  wa_access_token text,
  owner_phone text,
  telegram_bot_token text unique,
  telegram_owner_chat_id text,
  system_prompt text not null,
  deposit_amount_cents int default 2000,
  docuseal_template_id int,
  calendar_id text,
  created_at timestamptz default now()
);

create table services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  name text not null,
  duration_min int not null,
  price_eur numeric(10,2) not null,
  requires_deposit boolean default true,
  requires_consent boolean default true
);

create table chat_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  customer_phone text not null,
  customer_name text,
  status text default 'ai_active',
  updated_at timestamptz default now(),
  unique(tenant_id, customer_phone)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references chat_sessions(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz default now()
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  customer_phone text not null,
  customer_name text not null,
  service_name text not null,
  starts_at timestamptz not null,
  deposit_status text default 'pending',
  stripe_session_id text,
  docuseal_submission_id int,
  consent_status text default 'pending',
  signed_pdf_url text,
  created_at timestamptz default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  issue_date date,
  supplier_name text,
  supplier_nif text,
  invoice_number text,
  base_amount numeric(10,2),
  vat_rate numeric(5,2),
  vat_amount numeric(10,2),
  total_amount numeric(10,2),
  category text,
  pdf_storage_path text not null,
  created_at timestamptz default now()
);

-- AiBay relational contract for Neon PostgreSQL.
-- Apply through a migration tool in production; this file is intentionally idempotent.

create extension if not exists pgcrypto;

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  name text not null default 'Owner workspace',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  source_url text not null,
  canonical_url text,
  source_host text not null,
  access_tier text not null check (access_tier in ('official_api', 'public_metadata', 'user_evidence', 'blocked')),
  status text not null check (status in ('queued', 'running', 'ready', 'blocked', 'failed')),
  idempotency_key text not null,
  source_retrieved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(workspace_id, idempotency_key)
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references imports(id) on delete cascade,
  title text not null default '',
  brand text not null default '',
  model text not null default '',
  gtin text,
  mpn text,
  currency char(3) not null default 'USD',
  source_price numeric(12,2),
  description text not null default '',
  completeness smallint not null default 0 check (completeness between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists product_fields (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  label text not null,
  normalized_value text not null default '',
  state text not null check (state in ('verified', 'derived', 'needs_review', 'unknown')),
  method text not null,
  source_url text,
  source_pointer text,
  source_excerpt text,
  confidence numeric(5,2) not null default 0 check (confidence between 0 and 100),
  captured_at timestamptz not null default now()
);

create table if not exists variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  sku text,
  label text not null,
  attributes jsonb not null default '{}'::jsonb,
  source_price numeric(12,2),
  stock integer,
  active boolean not null default true
);

create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  source_url text,
  storage_key text,
  sha256 text,
  mime_type text,
  width integer,
  height integer,
  rights_confirmed boolean not null default false,
  derivative_of uuid references media_assets(id),
  review_status text not null default 'source' check (review_status in ('source', 'queued', 'review', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind text not null check (kind in ('import', 'research', 'optimize', 'media', 'export')),
  status text not null check (status in ('queued', 'running', 'complete', 'blocked', 'failed')),
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  error_code text,
  trace_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, idempotency_key)
);

create table if not exists market_snapshots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  marketplace text not null default 'EBAY_US',
  query text not null,
  currency char(3) not null default 'USD',
  result_count integer not null default 0,
  direct_match_count integer not null default 0,
  response_json jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);

create table if not exists optimization_runs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  market_snapshot_id uuid references market_snapshots(id),
  selected_variant_id uuid references variants(id),
  input_snapshot jsonb not null default '{}'::jsonb,
  output_json jsonb not null default '{}'::jsonb,
  approval_status text not null default 'review' check (approval_status in ('review', 'approved', 'rejected', 'exported')),
  created_at timestamptz not null default now()
);

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  optimization_run_id uuid not null references optimization_runs(id) on delete cascade,
  outcome text not null check (outcome in ('used', 'edited', 'rejected')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists product_fields_product_id_idx on product_fields(product_id);
create index if not exists variants_product_id_idx on variants(product_id);
create index if not exists market_snapshots_product_id_idx on market_snapshots(product_id);
create index if not exists jobs_workspace_status_idx on jobs(workspace_id, status);

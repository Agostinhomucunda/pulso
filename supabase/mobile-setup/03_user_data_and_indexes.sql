-- PARTE 3/6 — Favoritos, alertas, notificações e índices. Executar depois de todas as partes anteriores.
create table if not exists public.saved_opportunities (
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

create table if not exists public.user_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Meu alerta',
  categories text[] not null default '{}',
  provinces text[] not null default '{}',
  keywords text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.scan_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.sources(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed', 'needs_review')),
  items_seen integer not null default 0 check (items_seen >= 0),
  items_created integer not null default 0 check (items_created >= 0),
  error_summary text,
  created_at timestamptz not null default now()
);

create index if not exists opportunities_public_filter_idx
  on public.opportunities (category, province, application_deadline)
  where status = 'published' and verification_status = 'verified';
create index if not exists opportunities_organization_idx
  on public.opportunities (organization_id);
create index if not exists radar_signals_public_idx
  on public.radar_signals (detected_at desc)
  where status = 'published';
create index if not exists saved_opportunities_user_idx
  on public.saved_opportunities (user_id, created_at desc);
create index if not exists user_alerts_user_idx
  on public.user_alerts (user_id, active);
create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists scan_runs_source_idx
  on public.scan_runs (source_id, started_at desc);

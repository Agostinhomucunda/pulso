-- PULSO initial database schema
-- Run this file once in Supabase Dashboard > SQL Editor > New query.
-- No real/demo opportunities are inserted by this migration.
-- All public reads are limited to explicitly published and verified records.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  province text,
  municipality text,
  professional_area text,
  education_level text,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  description text,
  sector text,
  province text,
  municipality text,
  official_website text,
  logo_url text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_url text not null unique,
  source_type text not null default 'website'
    check (source_type in ('website', 'rss', 'api', 'manual')),
  terms_url text,
  access_status text not null default 'review'
    check (access_status in ('review', 'authorized', 'restricted', 'disabled')),
  active boolean not null default false,
  visible_publicly boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  source_id uuid references public.sources(id) on delete set null,
  title text not null,
  description text,
  category text not null
    check (category in ('employment', 'scholarship', 'public_competition', 'internship', 'training', 'recruitment_program')),
  sector text,
  province text,
  municipality text,
  vacancies integer check (vacancies is null or vacancies > 0),
  requirements text,
  education_level text,
  experience text,
  salary_min numeric(14,2) check (salary_min is null or salary_min >= 0),
  salary_max numeric(14,2) check (salary_max is null or salary_max >= 0),
  salary_currency text,
  application_deadline date,
  published_at timestamptz,
  source_name text not null,
  source_url text not null,
  application_url text,
  image_url text,
  image_source_url text,
  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'published', 'rejected', 'expired')),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (salary_min is null or salary_max is null or salary_max >= salary_min)
);

create table if not exists public.radar_signals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  source_id uuid references public.sources(id) on delete set null,
  title text not null,
  event_summary text not null,
  source_name text not null,
  source_url text not null,
  event_date date,
  detected_at timestamptz not null default now(),
  potential_impact text,
  related_professional_areas text[] not null default '{}',
  confidence smallint check (confidence is null or confidence between 0 and 100),
  status text not null default 'pending_review'
    check (status in ('draft', 'pending_review', 'published', 'dismissed')),
  disclaimer text not null default 'Análise de sinais públicos; não representa uma vaga confirmada nem garante recrutamento.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- A separate admin allow-list prevents users from promoting their own profile.
create or replace function public.is_pulso_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_pulso_admin() from public;
grant execute on function public.is_pulso_admin() to authenticated;

-- Create a private profile record when a Supabase Auth account is created.
create or replace function public.handle_new_pulso_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_pulso on auth.users;
create trigger on_auth_user_created_pulso
after insert on auth.users
for each row execute procedure public.handle_new_pulso_user();

alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.organizations enable row level security;
alter table public.sources enable row level security;
alter table public.opportunities enable row level security;
alter table public.radar_signals enable row level security;
alter table public.saved_opportunities enable row level security;
alter table public.user_alerts enable row level security;
alter table public.notifications enable row level security;
alter table public.scan_runs enable row level security;

-- Public visitors may read only verified organizations and published, verified opportunities.
drop policy if exists organizations_public_read on public.organizations;
create policy organizations_public_read on public.organizations
  for select to anon, authenticated
  using (verification_status = 'verified');
drop policy if exists organizations_admin_all on public.organizations;
create policy organizations_admin_all on public.organizations
  for all to authenticated
  using (public.is_pulso_admin()) with check (public.is_pulso_admin());

drop policy if exists sources_public_read on public.sources;
create policy sources_public_read on public.sources
  for select to anon, authenticated
  using (active and visible_publicly and access_status = 'authorized');
drop policy if exists sources_admin_all on public.sources;
create policy sources_admin_all on public.sources
  for all to authenticated
  using (public.is_pulso_admin()) with check (public.is_pulso_admin());

drop policy if exists opportunities_public_read on public.opportunities;
create policy opportunities_public_read on public.opportunities
  for select to anon, authenticated
  using (status = 'published' and verification_status = 'verified');
drop policy if exists opportunities_admin_all on public.opportunities;
create policy opportunities_admin_all on public.opportunities
  for all to authenticated
  using (public.is_pulso_admin()) with check (public.is_pulso_admin());

drop policy if exists radar_signals_public_read on public.radar_signals;
create policy radar_signals_public_read on public.radar_signals
  for select to anon, authenticated
  using (status = 'published');
drop policy if exists radar_signals_admin_all on public.radar_signals;
create policy radar_signals_admin_all on public.radar_signals
  for all to authenticated
  using (public.is_pulso_admin()) with check (public.is_pulso_admin());

drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_pulso_admin());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all to authenticated
  using (public.is_pulso_admin()) with check (public.is_pulso_admin());

drop policy if exists admin_users_read_own on public.admin_users;
create policy admin_users_read_own on public.admin_users
  for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists admin_users_admin_read on public.admin_users;
create policy admin_users_admin_read on public.admin_users
  for select to authenticated
  using (public.is_pulso_admin());

drop policy if exists saved_opportunities_own on public.saved_opportunities;
create policy saved_opportunities_own on public.saved_opportunities
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists user_alerts_own on public.user_alerts;
create policy user_alerts_own on public.user_alerts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists notifications_admin_all on public.notifications;
create policy notifications_admin_all on public.notifications
  for all to authenticated
  using (public.is_pulso_admin()) with check (public.is_pulso_admin());

drop policy if exists scan_runs_admin_all on public.scan_runs;
create policy scan_runs_admin_all on public.scan_runs
  for all to authenticated
  using (public.is_pulso_admin()) with check (public.is_pulso_admin());

-- Explicit table grants; RLS policies above remain the controlling access layer.
grant select on public.organizations, public.sources, public.opportunities, public.radar_signals to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant update (full_name, province, municipality, professional_area, education_level, preferences)
  on public.profiles to authenticated;
grant select on public.admin_users to authenticated;
grant select, insert, update, delete on public.saved_opportunities, public.user_alerts to authenticated;
grant select, update (read_at) on public.notifications to authenticated;
grant select, insert, update, delete on public.organizations, public.sources, public.opportunities,
  public.radar_signals to authenticated;
grant select on public.scan_runs, public.admin_users to authenticated;

-- To appoint the first administrator after that person has registered with PULSO,
-- run a separate owner-only SQL statement in the Supabase SQL Editor:
-- insert into public.admin_users (user_id)
-- select id from auth.users where email = 'YOUR_ADMIN_EMAIL';
-- Confirm the email matches exactly and that the Auth account already exists.

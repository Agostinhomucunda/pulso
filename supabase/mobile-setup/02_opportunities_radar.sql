-- PARTE 2/6 — Oportunidades e Radar. Executar depois de todas as partes anteriores.
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

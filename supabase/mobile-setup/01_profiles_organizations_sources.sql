-- PARTE 1/6 — Perfis, organizações e fontes. Executar depois de todas as partes anteriores.
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

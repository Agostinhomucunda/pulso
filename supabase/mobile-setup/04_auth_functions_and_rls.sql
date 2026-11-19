-- PARTE 4/6 — Funções de autenticação e activar RLS. Executar depois de todas as partes anteriores.
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

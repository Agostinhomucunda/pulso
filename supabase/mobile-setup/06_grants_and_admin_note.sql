-- PARTE 6/6 — Permissões SQL e nota de administração. Executar depois de todas as partes anteriores.
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

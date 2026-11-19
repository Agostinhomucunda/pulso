-- PARTE 5/6 — Políticas de leitura e escrita. Executar depois de todas as partes anteriores.
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

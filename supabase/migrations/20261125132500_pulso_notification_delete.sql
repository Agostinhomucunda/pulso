-- PULSO: permitir que cada utilizador limpe a sua própria caixa de notificações.
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant delete on public.notifications to authenticated;

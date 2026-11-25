-- PULSO Web Push: subscrições por dispositivo e os dois avisos de sistema autorizados.
-- Preparar localmente; executar no Supabase apenas após autorização explícita.

begin;

alter table public.notifications
  add column if not exists notification_type text not null default 'personal_alert',
  add column if not exists target_url text,
  add column if not exists event_key uuid;

do $migration$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_type_check'
  ) then
    alter table public.notifications
      add constraint notifications_type_check
      check (notification_type in ('personal_alert', 'opportunity_digest', 'admin_broadcast'));
  end if;
end;
$migration$;

create unique index if not exists notifications_user_event_key_uidx
  on public.notifications (user_id, event_key);
create index if not exists notifications_type_created_idx
  on public.notifications (notification_type, created_at desc);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 1 and 2048 and endpoint like 'https://%'),
  p256dh text not null check (length(p256dh) between 1 and 256),
  auth text not null check (length(auth) between 1 and 256),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_read_own on public.push_subscriptions;
create policy push_subscriptions_read_own on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own on public.push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.push_subscriptions from public, anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
grant select, insert, update on public.notifications to service_role;

-- Registo privado de envios para auditar avisos e evitar repetir um mesmo evento
-- quando o browser ou a rede volta a tentar a chamada.
create table if not exists public.push_notification_events (
  event_key uuid primary key,
  notification_type text not null check (notification_type in ('opportunity_digest', 'admin_broadcast')),
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null,
  message text not null,
  target_url text not null,
  opportunity_count integer not null default 0 check (opportunity_count >= 0),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed')),
  recipients_count integer not null default 0 check (recipients_count >= 0),
  push_delivered_count integer not null default 0 check (push_delivered_count >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.push_notification_events enable row level security;
revoke all on public.push_notification_events from public, anon, authenticated;
grant all on public.push_notification_events to service_role;

commit;

-- PULSO: subscrições Web Push por conta/dispositivo.
-- Adiciona apenas estruturas novas; não altera nem apaga notificações existentes.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  expiration_time bigint,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_key unique (endpoint),
  constraint push_subscriptions_endpoint_https check (endpoint ~ '^https://'),
  constraint push_subscriptions_p256dh_nonempty check (btrim(p256dh) <> ''),
  constraint push_subscriptions_auth_nonempty check (btrim(auth) <> '')
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id, updated_at desc);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own_select on public.push_subscriptions;
create policy push_subscriptions_own_select on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_own_insert on public.push_subscriptions;
create policy push_subscriptions_own_insert on public.push_subscriptions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_own_update on public.push_subscriptions;
create policy push_subscriptions_own_update on public.push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_own_delete on public.push_subscriptions;
create policy push_subscriptions_own_delete on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.push_subscriptions to authenticated;

create table if not exists public.push_notification_events (
  event_key uuid primary key,
  notification_type text not null check (notification_type in ('opportunity_digest', 'admin_broadcast')),
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null,
  message text not null,
  target_url text not null,
  opportunity_count integer not null default 0 check (opportunity_count >= 0),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed')),
  recipients_count integer,
  push_delivered_count integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.push_notification_events enable row level security;
-- O histórico de dispatch é apenas server-side; não é exposto ao browser.
revoke all on public.push_notification_events from anon, authenticated;

-- Mantém updated_at consistente nas subscrições sem depender do cliente.
create or replace function public.touch_pulso_push_subscription()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_pulso_push_subscription() from public;
drop trigger if exists touch_pulso_push_subscription on public.push_subscriptions;
create trigger touch_pulso_push_subscription
before update on public.push_subscriptions
for each row execute function public.touch_pulso_push_subscription();

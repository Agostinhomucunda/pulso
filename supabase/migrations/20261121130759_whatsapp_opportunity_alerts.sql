-- PULSO: alertas de oportunidades por WhatsApp com envio manual.
-- Preparação local; NÃO executar na Supabase sem autorização separada.
-- Não altera public.user_alerts nem a tabela de notificações existente.

create table if not exists public.whatsapp_alert_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  categories text[] not null default '{}',
  sectors text[] not null default '{}',
  provinces text[] not null default '{}',
  keywords text[] not null default '{}',
  whatsapp_number text not null,
  consent_given boolean not null default false,
  consented_at timestamptz,
  consent_text_version text not null default 'pulso-whatsapp-v1',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_alert_number_e164 check (whatsapp_number ~ '^[+][1-9][0-9]{7,14}$'),
  constraint whatsapp_alert_categories_allowed check (
    categories <@ array['employment', 'scholarship', 'public_competition', 'internship', 'training', 'recruitment_program']::text[]
  ),
  constraint whatsapp_alert_minimum_criteria check (
    cardinality(categories) + cardinality(sectors) + cardinality(provinces) + cardinality(keywords) > 0
  ),
  constraint whatsapp_alert_consent_required check (
    not active or (consent_given and consented_at is not null)
  )
);

create table if not exists public.whatsapp_alert_dispatches (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.whatsapp_alert_subscriptions(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'dismissed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_by uuid references auth.users(id) on delete set null,
  unique (subscription_id, opportunity_id),
  constraint whatsapp_dispatch_sent_fields check (
    (status = 'sent' and sent_at is not null and sent_by is not null)
    or (status <> 'sent' and sent_at is null and sent_by is null)
  )
);

create index if not exists whatsapp_alert_subscriptions_active_idx
  on public.whatsapp_alert_subscriptions (active, updated_at desc);
create index if not exists whatsapp_alert_dispatches_queue_idx
  on public.whatsapp_alert_dispatches (status, created_at desc);
create index if not exists whatsapp_alert_dispatches_subscription_idx
  on public.whatsapp_alert_dispatches (subscription_id, status, created_at desc);

alter table public.whatsapp_alert_subscriptions enable row level security;
alter table public.whatsapp_alert_dispatches enable row level security;
revoke all on public.whatsapp_alert_subscriptions from public, anon;
revoke all on public.whatsapp_alert_dispatches from public, anon;

drop policy if exists whatsapp_alert_subscriptions_read_own on public.whatsapp_alert_subscriptions;
create policy whatsapp_alert_subscriptions_read_own
  on public.whatsapp_alert_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists whatsapp_alert_subscriptions_insert_own on public.whatsapp_alert_subscriptions;
create policy whatsapp_alert_subscriptions_insert_own
  on public.whatsapp_alert_subscriptions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and consent_given
    and consented_at is not null
  );

drop policy if exists whatsapp_alert_subscriptions_update_own on public.whatsapp_alert_subscriptions;
create policy whatsapp_alert_subscriptions_update_own
  on public.whatsapp_alert_subscriptions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (not active or (consent_given and consented_at is not null))
  );

drop policy if exists whatsapp_alert_subscriptions_delete_own on public.whatsapp_alert_subscriptions;
create policy whatsapp_alert_subscriptions_delete_own
  on public.whatsapp_alert_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists whatsapp_alert_subscriptions_admin_read on public.whatsapp_alert_subscriptions;
create policy whatsapp_alert_subscriptions_admin_read
  on public.whatsapp_alert_subscriptions for select to authenticated
  using (public.is_pulso_admin());

drop policy if exists whatsapp_alert_dispatches_admin_read on public.whatsapp_alert_dispatches;
create policy whatsapp_alert_dispatches_admin_read
  on public.whatsapp_alert_dispatches for select to authenticated
  using (public.is_pulso_admin());

grant select, insert, update, delete on public.whatsapp_alert_subscriptions to authenticated;
grant select on public.whatsapp_alert_dispatches to authenticated;

-- Função interna: só devolve correspondência para subscrições activas e
-- oportunidades publicadas e verificadas. O acesso directo é revogado abaixo.
create or replace function public.pulso_whatsapp_alert_matches(
  p_subscription_id uuid,
  p_opportunity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    subscription.active
    and (
      cardinality(subscription.categories) = 0
      or opportunity.category = any (subscription.categories)
    )
    and (
      cardinality(subscription.sectors) = 0
      or exists (
        select 1
        from pg_catalog.unnest(subscription.sectors) as sector_filter(value)
        where pg_catalog.btrim(sector_filter.value) <> ''
          and pg_catalog.lower(pg_catalog.btrim(sector_filter.value))
            = pg_catalog.lower(pg_catalog.btrim(coalesce(opportunity.sector, '')))
      )
    )
    and (
      cardinality(subscription.provinces) = 0
      or exists (
        select 1
        from pg_catalog.unnest(subscription.provinces) as province_filter(value)
        where pg_catalog.btrim(province_filter.value) <> ''
          and pg_catalog.lower(pg_catalog.btrim(province_filter.value))
            = pg_catalog.lower(pg_catalog.btrim(coalesce(opportunity.province, '')))
      )
    )
    and (
      cardinality(subscription.keywords) = 0
      or exists (
        select 1
        from pg_catalog.unnest(subscription.keywords) as keyword_filter(value)
        where pg_catalog.btrim(keyword_filter.value) <> ''
          and pg_catalog.strpos(
            pg_catalog.lower(pg_catalog.concat_ws(
              ' ', opportunity.title, opportunity.description, opportunity.sector,
              opportunity.province, opportunity.municipality, opportunity.requirements,
              opportunity.source_name
            )),
            pg_catalog.lower(pg_catalog.btrim(keyword_filter.value))
          ) > 0
      )
    ),
    false
  )
  from public.whatsapp_alert_subscriptions as subscription
  join public.opportunities as opportunity on opportunity.id = p_opportunity_id
  where subscription.id = p_subscription_id
    and opportunity.status = 'published'
    and opportunity.verification_status = 'verified';
$function$;

revoke all on function public.pulso_whatsapp_alert_matches(uuid, uuid) from public, anon, authenticated;

-- Sincroniza a fila quando um critério é criado/alterado/desactivado.
create or replace function public.sync_pulso_whatsapp_subscription_matches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  eligible_opportunity record;
begin
  if not new.active then
    delete from public.whatsapp_alert_dispatches
    where subscription_id = new.id and status = 'pending';
    return new;
  end if;

  delete from public.whatsapp_alert_dispatches as dispatch
  where dispatch.subscription_id = new.id
    and dispatch.status = 'pending'
    and not public.pulso_whatsapp_alert_matches(new.id, dispatch.opportunity_id);

  for eligible_opportunity in
    select opportunity.id
    from public.opportunities as opportunity
    where opportunity.status = 'published'
      and opportunity.verification_status = 'verified'
  loop
    if public.pulso_whatsapp_alert_matches(new.id, eligible_opportunity.id) then
      insert into public.whatsapp_alert_dispatches (subscription_id, opportunity_id)
      values (new.id, eligible_opportunity.id)
      on conflict (subscription_id, opportunity_id) do update
      set status = 'pending', updated_at = now()
      where public.whatsapp_alert_dispatches.status = 'cancelled';
    end if;
  end loop;
  return new;
end;
$function$;

revoke all on function public.sync_pulso_whatsapp_subscription_matches() from public, anon, authenticated;

drop trigger if exists on_pulso_whatsapp_subscription_match on public.whatsapp_alert_subscriptions;
create trigger on_pulso_whatsapp_subscription_match
after insert or update of categories, sectors, provinces, keywords, active
on public.whatsapp_alert_subscriptions
for each row execute function public.sync_pulso_whatsapp_subscription_matches();

-- Sincroniza a fila quando uma oportunidade é publicada/verificada ou os seus
-- campos mudam; mudanças deixam pendentes obsoletas como canceladas.
create or replace function public.sync_pulso_whatsapp_opportunity_matches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  eligible_subscription record;
begin
  if new.status <> 'published' or new.verification_status <> 'verified' then
    update public.whatsapp_alert_dispatches
    set status = 'cancelled', updated_at = now()
    where opportunity_id = new.id and status = 'pending';
    return new;
  end if;

  update public.whatsapp_alert_dispatches as dispatch
  set status = 'cancelled', updated_at = now()
  where dispatch.opportunity_id = new.id
    and dispatch.status = 'pending'
    and not public.pulso_whatsapp_alert_matches(dispatch.subscription_id, new.id);

  for eligible_subscription in
    select subscription.id
    from public.whatsapp_alert_subscriptions as subscription
    where subscription.active
  loop
    if public.pulso_whatsapp_alert_matches(eligible_subscription.id, new.id) then
      insert into public.whatsapp_alert_dispatches (subscription_id, opportunity_id)
      values (eligible_subscription.id, new.id)
      on conflict (subscription_id, opportunity_id) do update
      set status = 'pending', updated_at = now()
      where public.whatsapp_alert_dispatches.status = 'cancelled';
    end if;
  end loop;
  return new;
end;
$function$;

revoke all on function public.sync_pulso_whatsapp_opportunity_matches() from public, anon, authenticated;

drop trigger if exists on_pulso_whatsapp_opportunity_match on public.opportunities;
create trigger on_pulso_whatsapp_opportunity_match
after insert or update on public.opportunities
for each row execute function public.sync_pulso_whatsapp_opportunity_matches();

-- Acção administrativa explícita após o envio manual no WhatsApp Web/aplicação.
create or replace function public.set_pulso_whatsapp_dispatch_status(
  p_dispatch_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.is_pulso_admin() then
    raise exception 'Apenas administradores PULSO podem actualizar a fila WhatsApp.';
  end if;
  if p_status not in ('sent', 'dismissed') then
    raise exception 'Estado de fila inválido.';
  end if;

  update public.whatsapp_alert_dispatches
  set status = p_status,
      updated_at = now(),
      sent_at = case when p_status = 'sent' then now() else null end,
      sent_by = case when p_status = 'sent' then (select auth.uid()) else null end
  where id = p_dispatch_id
    and status = 'pending';

  return found;
end;
$function$;

revoke all on function public.set_pulso_whatsapp_dispatch_status(uuid, text) from public, anon;
grant execute on function public.set_pulso_whatsapp_dispatch_status(uuid, text) to authenticated;

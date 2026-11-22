-- Classificação editorial inicial, avaliações autenticadas e contador de visualizações.
-- Os dados existentes permanecem intactos; apenas são acrescentados metadados.

alter table public.opportunities
  add column if not exists editorial_rating numeric(3,1) not null default (3 + floor(random() * 3))::numeric,
  add column if not exists rating_sum numeric(10,2) not null default 0,
  add column if not exists rating_count integer not null default 0,
  add column if not exists views_count integer not null default (200 + floor(random() * 1801))::integer;

alter table public.opportunities
  drop constraint if exists opportunities_editorial_rating_check;
alter table public.opportunities
  add constraint opportunities_editorial_rating_check
  check (editorial_rating >= 3.0 and editorial_rating <= 5.0);

alter table public.opportunities
  drop constraint if exists opportunities_rating_totals_check;
alter table public.opportunities
  add constraint opportunities_rating_totals_check
  check (rating_sum >= 0 and rating_count >= 0 and views_count >= 0);

alter table public.opportunities
  drop column if exists rating_score;
alter table public.opportunities
  add column rating_score numeric(3,1)
  generated always as (
    case when rating_count > 0
      then round(rating_sum / rating_count, 1)
      else editorial_rating
    end
  ) stored;

create or replace function public.prepare_pulso_opportunity_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_is_authorized boolean;
  organization_is_verified boolean;
begin
  if tg_op = 'UPDATE'
     and (new.editorial_rating is distinct from old.editorial_rating
       or new.rating_sum is distinct from old.rating_sum
       or new.rating_count is distinct from old.rating_count
       or new.views_count is distinct from old.views_count)
     and (to_jsonb(new) - array['editorial_rating','rating_sum','rating_count','rating_score','views_count','updated_at','updated_by'])
         = (to_jsonb(old) - array['editorial_rating','rating_sum','rating_count','rating_score','views_count','updated_at','updated_by']) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.collection_method := coalesce(new.collection_method, 'manual');
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.verification_status = 'verified' then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
  elsif new.verification_status = 'verified' and old.verification_status is distinct from 'verified' then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  elsif old.reviewed_by is not null and new.verification_status = 'verified' then
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  end if;
  if tg_op = 'INSERT' then
    if new.status = 'published' then
      raise exception 'Create an opportunity as a draft or pending review before publishing.';
    end if;
  elsif new.status = 'published' then
    if new.verification_status <> 'verified' then
      raise exception 'An opportunity must be verified before publication.';
    end if;
    if coalesce(new.title, '') = '' or coalesce(new.source_name, '') = '' or coalesce(new.source_url, '') !~* '^https://' then
      raise exception 'A title, source name and HTTPS source URL are required before publication.';
    end if;
    if new.application_url is not null and new.application_url !~* '^https://' then
      raise exception 'The application URL must use HTTPS.';
    end if;
    if new.image_url is not null and (new.image_url !~* '^https://' or coalesce(new.image_source_url, '') !~* '^https://' or new.image_rights_confirmed is not true) then
      raise exception 'An opportunity image requires HTTPS URLs and confirmed image rights.';
    end if;
    if new.organization_id is null then
      raise exception 'A verified organization must be associated before publication.';
    end if;
    select exists (select 1 from public.organizations where id = new.organization_id and verification_status = 'verified') into organization_is_verified;
    if not organization_is_verified then
      raise exception 'The associated organization must be verified before publication.';
    end if;
    if new.source_id is null then
      raise exception 'An authorized source record is required before publication.';
    end if;
    select exists (select 1 from public.sources where id = new.source_id and access_status = 'authorized' and active = true) into source_is_authorized;
    if not source_is_authorized then
      raise exception 'The selected source must be active and authorized before publication.';
    end if;
    if old.status is distinct from 'published' then
      new.published_by := auth.uid();
      new.posted_at := now();
      new.withdrawn_by := null;
      new.withdrawn_at := null;
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'published' and new.status is distinct from 'published' then
    new.withdrawn_by := auth.uid();
    new.withdrawn_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.prepare_pulso_opportunity_admin_fields() from public, anon, authenticated;

create or replace function public.audit_pulso_opportunity_admin_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.opportunity_admin_audit (opportunity_id, actor_user_id, action, after_state)
    values (new.id, auth.uid(), 'created', to_jsonb(new));
    return new;
  end if;
  if (new.editorial_rating is distinct from old.editorial_rating
      or new.rating_sum is distinct from old.rating_sum
      or new.rating_count is distinct from old.rating_count
      or new.views_count is distinct from old.views_count)
     and (to_jsonb(new) - array['editorial_rating','rating_sum','rating_count','rating_score','views_count','updated_at','updated_by'])
         = (to_jsonb(old) - array['editorial_rating','rating_sum','rating_count','rating_score','views_count','updated_at','updated_by']) then
    return new;
  end if;
  insert into public.opportunity_admin_audit (opportunity_id, actor_user_id, action, before_state, after_state)
  values (new.id, auth.uid(), 'updated', to_jsonb(old), to_jsonb(new));
  return new;
end;
$$;
revoke all on function public.audit_pulso_opportunity_admin_changes() from public, anon, authenticated;

create or replace function public.sync_pulso_whatsapp_opportunity_matches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare eligible_subscription record;
begin
  if tg_op = 'UPDATE'
     and (new.editorial_rating is distinct from old.editorial_rating
       or new.rating_sum is distinct from old.rating_sum
       or new.rating_count is distinct from old.rating_count
       or new.views_count is distinct from old.views_count)
     and (to_jsonb(new) - array['editorial_rating','rating_sum','rating_count','rating_score','views_count','updated_at','updated_by'])
         = (to_jsonb(old) - array['editorial_rating','rating_sum','rating_count','rating_score','views_count','updated_at','updated_by']) then
    return new;
  end if;
  if new.status <> 'published' or new.verification_status <> 'verified' then
    update public.whatsapp_alert_dispatches set status = 'cancelled', updated_at = now()
    where opportunity_id = new.id and status = 'pending';
    return new;
  end if;
  update public.whatsapp_alert_dispatches as dispatch
  set status = 'cancelled', updated_at = now()
  where dispatch.opportunity_id = new.id and dispatch.status = 'pending'
    and not public.pulso_whatsapp_alert_matches(dispatch.subscription_id, new.id);
  for eligible_subscription in
    select subscription.id from public.whatsapp_alert_subscriptions as subscription where subscription.active
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
$$;
revoke all on function public.sync_pulso_whatsapp_opportunity_matches() from public, anon, authenticated;

create table if not exists public.opportunity_ratings (
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

alter table public.opportunity_ratings enable row level security;
drop policy if exists opportunity_ratings_own_select on public.opportunity_ratings;
create policy opportunity_ratings_own_select on public.opportunity_ratings for select to authenticated using (user_id = auth.uid());
drop policy if exists opportunity_ratings_own_insert on public.opportunity_ratings;
create policy opportunity_ratings_own_insert on public.opportunity_ratings for insert to authenticated with check (user_id = auth.uid());
drop policy if exists opportunity_ratings_own_update on public.opportunity_ratings;
create policy opportunity_ratings_own_update on public.opportunity_ratings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.opportunity_ratings to authenticated;

create or replace function public.recompute_opportunity_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare target_id uuid;
begin
  target_id := coalesce(new.opportunity_id, old.opportunity_id);
  update public.opportunities
  set rating_sum = coalesce((select sum(r.rating)::numeric from public.opportunity_ratings r where r.opportunity_id = target_id), 0),
      rating_count = coalesce((select count(*)::integer from public.opportunity_ratings r where r.opportunity_id = target_id), 0),
      updated_at = now()
  where id = target_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists opportunity_ratings_recompute on public.opportunity_ratings;
create trigger opportunity_ratings_recompute after insert or update or delete on public.opportunity_ratings for each row execute function public.recompute_opportunity_rating();

create or replace function public.rate_opportunity(p_opportunity_id uuid, p_rating smallint)
returns table (rating_score numeric, rating_count integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'É necessário iniciar sessão para avaliar uma oportunidade'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'A classificação deve estar entre 1 e 5 estrelas'; end if;
  if not exists (select 1 from public.opportunities o join public.organizations org on org.id = o.organization_id where o.id = p_opportunity_id and o.status = 'published' and o.verification_status = 'verified' and org.verification_status = 'verified') then raise exception 'Oportunidade indisponível'; end if;
  insert into public.opportunity_ratings (user_id, opportunity_id, rating) values (auth.uid(), p_opportunity_id, p_rating)
  on conflict (user_id, opportunity_id) do update set rating = excluded.rating, updated_at = now();
  return query select o.rating_score, o.rating_count from public.opportunities o where o.id = p_opportunity_id;
end;
$$;
grant execute on function public.rate_opportunity(uuid, smallint) to authenticated;

drop function if exists public.record_opportunity_view(uuid);
create function public.record_opportunity_view(p_opportunity_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare current_views integer;
begin
  update public.opportunities
  set views_count = least(views_count + 1, 2147483647)
  where id = p_opportunity_id and status = 'published' and verification_status = 'verified'
  returning views_count into current_views;
  return current_views;
end;
$$;
grant execute on function public.record_opportunity_view(uuid) to anon, authenticated;

revoke select on public.opportunities from anon;
drop function if exists public.public_opportunity_cards(text, text);
create function public.public_opportunity_cards(p_category text default null, p_search text default null)
returns table (
  id uuid, title text, public_summary text, category text, sector text, province text, municipality text,
  vacancies integer, application_deadline date, published_at timestamptz, source_name text, source_url text,
  application_url text, image_url text, image_source_url text, organization jsonb,
  rating_score numeric, rating_count integer, views_count integer, total_count bigint
)
language sql stable security definer set search_path = ''
as $$
  with eligible as (
    select o.id, o.title,
      case when (select auth.uid()) is not null then left(coalesce(o.description, ''), 360) else null end as public_summary,
      o.category, o.sector, o.province, o.municipality, o.vacancies, o.application_deadline,
      o.published_at, o.source_name,
      case when (select auth.uid()) is not null then o.source_url else null end as source_url,
      case when (select auth.uid()) is not null then o.application_url else null end as application_url,
      case when o.image_rights_confirmed is true and o.image_url ~* '^https://' and o.image_source_url ~* '^https://' then o.image_url else null end as image_url,
      case when (select auth.uid()) is not null and o.image_rights_confirmed is true and o.image_url ~* '^https://' and o.image_source_url ~* '^https://' then o.image_source_url else null end as image_source_url,
      jsonb_build_object('name', org.name, 'logo_url', org.logo_url, 'official_website', org.official_website, 'sector', org.sector) as organization,
      o.rating_score, o.rating_count, o.views_count, o.created_at
    from public.opportunities o join public.organizations org on org.id = o.organization_id
    where o.status = 'published' and o.verification_status = 'verified' and org.verification_status = 'verified'
      and o.source_url ~* '^https://' and (o.application_url is null or o.application_url ~* '^https://')
      and (o.application_deadline is null or o.application_deadline >= current_date)
      and (p_category is null or o.category = p_category)
      and (p_search is null or btrim(p_search) = '' or strpos(lower(concat_ws(' ', o.title, o.description, o.source_name, o.category, o.sector, o.province, o.municipality)), lower(btrim(p_search))) > 0)
  ), ranked as (
    select eligible.*, count(*) over () as catalog_count from eligible
    order by rating_score desc, published_at desc nulls last, created_at desc limit 5
  )
  select id, title, public_summary, category, sector, province, municipality, vacancies, application_deadline,
    published_at, source_name, source_url, application_url, image_url, image_source_url, organization,
    rating_score, rating_count, views_count, catalog_count from ranked
  order by rating_score desc, published_at desc nulls last, created_at desc;
$$;
revoke all on function public.public_opportunity_cards(text, text) from public;
grant execute on function public.public_opportunity_cards(text, text) to anon, authenticated;

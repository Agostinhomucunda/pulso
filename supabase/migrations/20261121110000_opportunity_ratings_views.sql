-- Classificação editorial inicial, avaliações autenticadas e contador de visualizações.
-- Os dados existentes permanecem intactos; apenas são acrescentados metadados.

alter table public.opportunities
  add column if not exists editorial_rating numeric(3,1) not null default 3.0,
  add column if not exists rating_sum numeric(10,2) not null default 0,
  add column if not exists rating_count integer not null default 0,
  add column if not exists views_count integer not null default 200;

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

update public.opportunities
set editorial_rating = (3 + (get_byte(decode(md5(id::text), 'hex'), 0) % 3))::numeric,
    views_count = 200 + (get_byte(decode(md5(id::text), 'hex'), 1) % 1801)
where id in (select id from public.opportunities where image_rights_confirmed = true and editorial_rating = 3.0 and rating_count = 0 and rating_sum = 0 and views_count = 200 limit 500);

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

create or replace function public.record_opportunity_view(p_opportunity_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.opportunities
  set views_count = least(views_count + 1, 2147483647)
  where id = p_opportunity_id and status = 'published' and verification_status = 'verified';
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
      o.image_url,
      case when (select auth.uid()) is not null then o.image_source_url else null end as image_source_url,
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

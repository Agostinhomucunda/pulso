alter table public.opportunities
  alter column source_url drop not null;

alter table public.opportunities
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists application_instructions text;

drop function if exists public.public_opportunity_cards(text, text);

create function public.public_opportunity_cards(p_category text default null, p_search text default null)
returns table (
  id uuid, title text, public_summary text, category text, sector text, province text, municipality text,
  vacancies integer, application_deadline date, published_at timestamptz, source_name text, source_url text,
  application_url text, application_instructions text, contact_phone text, contact_email text,
  image_url text, image_source_url text, organization jsonb,
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
      case when (select auth.uid()) is not null then o.application_instructions else null end as application_instructions,
      case when (select auth.uid()) is not null then o.contact_phone else null end as contact_phone,
      case when (select auth.uid()) is not null then o.contact_email else null end as contact_email,
      case when o.image_rights_confirmed is true and o.image_url ~* '^https://' and o.image_source_url ~* '^https://' then o.image_url else null end as image_url,
      case when (select auth.uid()) is not null and o.image_rights_confirmed is true and o.image_url ~* '^https://' and o.image_source_url ~* '^https://' then o.image_source_url else null end as image_source_url,
      jsonb_build_object('name', org.name, 'logo_url', org.logo_url, 'official_website', org.official_website, 'sector', org.sector) as organization,
      o.rating_score, o.rating_count, o.views_count, o.created_at
    from public.opportunities o
    join public.organizations org on org.id = o.organization_id
    left join public.sources s on s.id = o.source_id
    where o.status = 'published' and o.verification_status = 'verified' and org.verification_status = 'verified'
      and (o.source_url ~* '^https://' or o.application_url ~* '^https://' or o.description is not null or o.application_instructions is not null or o.contact_phone is not null or o.contact_email is not null)
      and (o.application_url is null or o.application_url ~* '^https://')
      and (o.source_id is null or (s.access_status = 'authorized' and s.active = true and s.visible_publicly = true))
      and (o.application_deadline is null or o.application_deadline >= current_date)
      and (p_category is null or o.category = p_category)
      and (p_search is null or btrim(p_search) = '' or strpos(lower(concat_ws(' ', o.title, o.description, o.source_name, o.category, o.sector, o.province, o.municipality, o.contact_phone, o.contact_email)), lower(btrim(p_search))) > 0)
  ), ranked as (
    select eligible.*, count(*) over () as catalog_count from eligible
    order by rating_score desc, published_at desc nulls last, created_at desc limit 5
  )
  select id, title, public_summary, category, sector, province, municipality, vacancies, application_deadline,
    published_at, source_name, source_url, application_url, application_instructions, contact_phone, contact_email,
    image_url, image_source_url, organization, rating_score, rating_count, views_count, catalog_count from ranked
  order by rating_score desc, published_at desc nulls last, created_at desc;
$$;

revoke all on function public.public_opportunity_cards(text, text) from public;
grant execute on function public.public_opportunity_cards(text, text) to anon, authenticated;

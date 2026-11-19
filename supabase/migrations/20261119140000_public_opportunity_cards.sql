-- PULSO public catalogue boundary.
-- Apply once in Supabase Dashboard > SQL Editor.
-- The public homepage receives only a capped, safe card projection.

revoke select on public.opportunities from anon;

drop function if exists public.public_opportunity_cards(text, text);
create function public.public_opportunity_cards(
  p_category text default null,
  p_search text default null
)
returns table (
  id uuid,
  title text,
  public_summary text,
  category text,
  sector text,
  province text,
  municipality text,
  vacancies integer,
  application_deadline date,
  published_at timestamptz,
  source_name text,
  source_url text,
  application_url text,
  image_url text,
  image_source_url text,
  organization jsonb,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible as (
    select
      o.id,
      o.title,
      left(coalesce(o.description, ''), 360) as public_summary,
      o.category,
      o.sector,
      o.province,
      o.municipality,
      o.vacancies,
      o.application_deadline,
      o.published_at,
      o.source_name,
      o.source_url,
      o.application_url,
      o.image_url,
      o.image_source_url,
      jsonb_build_object(
        'name', org.name,
        'logo_url', org.logo_url,
        'official_website', org.official_website,
        'sector', org.sector
      ) as organization,
      o.created_at
    from public.opportunities o
    join public.organizations org on org.id = o.organization_id
    where o.status = 'published'
      and o.verification_status = 'verified'
      and org.verification_status = 'verified'
      and o.source_url ~* '^https://'
      and (o.application_url is null or o.application_url ~* '^https://')
      and (o.application_deadline is null or o.application_deadline >= current_date)
      and (p_category is null or o.category = p_category)
      and (
        p_search is null
        or btrim(p_search) = ''
        or strpos(lower(concat_ws(' ', o.title, o.description, o.source_name,
          o.category, o.sector, o.province, o.municipality)), lower(btrim(p_search))) > 0
      )
  ), ranked as (
    select eligible.*, count(*) over () as catalog_count
    from eligible
    order by published_at desc nulls last, created_at desc
    limit 5
  )
  select
    ranked.id,
    ranked.title,
    ranked.public_summary,
    ranked.category,
    ranked.sector,
    ranked.province,
    ranked.municipality,
    ranked.vacancies,
    ranked.application_deadline,
    ranked.published_at,
    ranked.source_name,
    ranked.source_url,
    ranked.application_url,
    ranked.image_url,
    ranked.image_source_url,
    ranked.organization,
    ranked.catalog_count
  from ranked
  order by ranked.published_at desc nulls last, ranked.created_at desc;
$$;

revoke all on function public.public_opportunity_cards(text, text) from public;
grant execute on function public.public_opportunity_cards(text, text) to anon, authenticated;

-- PULSO: additive source registry and AI-assisted automatic publication.
-- Apply only after reviewing in Supabase SQL Editor. The manual dashboard form
-- and existing opportunity records are left intact.

alter table public.sources
  add column if not exists source_group text not null default 'Outras fontes',
  add column if not exists source_class text not null default 'other',
  add column if not exists collection_endpoint text,
  add column if not exists collection_format text,
  add column if not exists collection_allowed_hosts text[] not null default '{}',
  add column if not exists collection_enabled boolean not null default false,
  add column if not exists last_scanned_at timestamptz,
  add column if not exists last_scan_status text,
  add column if not exists last_scan_error text;

alter table public.sources
  drop constraint if exists sources_source_class_check;
alter table public.sources
  add constraint sources_source_class_check
  check (source_class in (
    'official_institution', 'employer', 'news_media',
    'international_organization', 'scholarship_provider',
    'data_source', 'training_provider', 'other'
  ));

alter table public.sources
  drop constraint if exists sources_collection_format_check;
alter table public.sources
  add constraint sources_collection_format_check
  check (collection_format is null or collection_format in ('rss', 'atom', 'json_feed'));

alter table public.sources
  drop constraint if exists sources_collection_endpoint_https_check;
alter table public.sources
  add constraint sources_collection_endpoint_https_check
  check (collection_endpoint is null or collection_endpoint ~* '^https://');

alter table public.sources
  drop constraint if exists sources_collection_enabled_gate_check;
alter table public.sources
  add constraint sources_collection_enabled_gate_check
  check (
    not collection_enabled
    or (
      active = true
      and access_status = 'authorized'
      and source_type in ('rss', 'api')
      and collection_endpoint is not null
      and collection_format is not null
    )
  );

create index if not exists sources_automatic_collection_idx
  on public.sources (active, access_status, collection_enabled)
  where collection_enabled = true;

-- Entries are the exact URLs and names supplied in the user's file. No RSS/API
-- endpoint is inferred. New records remain inactive and awaiting admin approval.
insert into public.sources
  (name, source_url, source_type, access_status, active, visible_publicly,
   source_group, source_class, collection_enabled)
values
  ('Governo de Angola', 'https://governo.gov.ao/', 'website', 'review', false, false, 'Angola — Governo e Instituições Públicas', 'official_institution', false),
  ('SEPE', 'https://www.sepe.gov.ao/', 'website', 'review', false, false, 'Angola — Governo e Instituições Públicas', 'official_institution', false),
  ('ENAPP', 'https://enapp.gov.ao/publico', 'website', 'review', false, false, 'Angola — Governo e Instituições Públicas', 'official_institution', false),
  ('INAGBE', 'https://www.inagbe.gov.ao/', 'website', 'review', false, false, 'Angola — Governo e Instituições Públicas', 'official_institution', false),
  ('Ministério do Ensino Superior', 'https://mescti.gov.ao/', 'website', 'review', false, false, 'Angola — Governo e Instituições Públicas', 'official_institution', false),
  ('Portal da Transparência', 'https://transparenciapublica.ao/', 'website', 'review', false, false, 'Angola — Governo e Instituições Públicas', 'official_institution', false),
  ('Portal de Compras Públicas', 'https://compraspublicas.minfin.gov.ao/ComprasPublicas/', 'website', 'review', false, false, 'Angola — Governo e Instituições Públicas', 'official_institution', false),
  ('eQuadros', 'https://portal.equadros.gov.ao/', 'website', 'review', false, false, 'Angola — Governo e Instituições Públicas', 'official_institution', false),
  ('INEFOP', 'https://www.inefop.gov.ao/', 'website', 'review', false, false, 'Angola — Governo e Instituições Públicas', 'official_institution', false),
  ('Sonangol', 'https://www.sonangol.co.ao/', 'website', 'review', false, false, 'Angola — Empresas e Recrutamento', 'employer', false),
  ('Unitel', 'https://www.unitel.ao/', 'website', 'review', false, false, 'Angola — Empresas e Recrutamento', 'employer', false),
  ('Unitel Oportunidades de Carreira', 'https://oportunidadesdecarreira.unitel.ao/', 'website', 'review', false, false, 'Angola — Empresas e Recrutamento', 'employer', false),
  ('Banco de Fomento Angola', 'https://www.bfa.ao/', 'website', 'review', false, false, 'Angola — Empresas e Recrutamento', 'employer', false),
  ('BFA Careers', 'https://careers.bfa.ao/job/', 'website', 'review', false, false, 'Angola — Empresas e Recrutamento', 'employer', false),
  ('Pumangol Recrutamento', 'https://recrutamento.pumangol.co.ao/opportunities', 'website', 'review', false, false, 'Angola — Empresas e Recrutamento', 'employer', false),
  ('TAAG', 'https://www.taag.com/', 'website', 'review', false, false, 'Angola — Empresas e Recrutamento', 'employer', false),
  ('ENDE', 'https://www.ende.co.ao/', 'website', 'review', false, false, 'Angola — Empresas e Recrutamento', 'employer', false),
  ('EPAL', 'https://www.epal.co.ao/', 'website', 'review', false, false, 'Angola — Empresas e Recrutamento', 'employer', false),
  ('Banco Angolano de Investimentos', 'https://www.bancobai.ao/', 'website', 'review', false, false, 'Angola — Empresas e Recrutamento', 'employer', false),
  ('MCA Group', 'https://www.mca-group.com/', 'website', 'review', false, false, 'Angola — Empresas e Recrutamento', 'employer', false),
  ('Grupo Omatapalo', 'https://omatapalo.com/', 'website', 'review', false, false, 'Angola — Empresas e Recrutamento', 'employer', false),
  ('Grupo Carrinho', 'https://grupocarrinho.com/', 'website', 'review', false, false, 'Angola — Empresas e Recrutamento', 'employer', false),
  ('ANGOP', 'https://angop.ao/', 'website', 'review', false, false, 'Angola — Notícias, Economia e Investimentos', 'news_media', false),
  ('Jornal de Angola', 'https://www.jornaldeangola.ao/', 'website', 'review', false, false, 'Angola — Notícias, Economia e Investimentos', 'news_media', false),
  ('Novo Jornal', 'https://novojornal.co.ao/', 'website', 'review', false, false, 'Angola — Notícias, Economia e Investimentos', 'news_media', false),
  ('Expansão', 'https://expansao.co.ao/', 'website', 'review', false, false, 'Angola — Notícias, Economia e Investimentos', 'news_media', false),
  ('VerAngola', 'https://www.verangola.net/', 'website', 'review', false, false, 'Angola — Notícias, Economia e Investimentos', 'news_media', false),
  ('O País', 'https://opais.ao/', 'website', 'review', false, false, 'Angola — Notícias, Economia e Investimentos', 'news_media', false),
  ('TPA', 'https://tpaonline.ao/', 'website', 'review', false, false, 'Angola — Notícias, Economia e Investimentos', 'news_media', false),
  ('Rádio Nacional de Angola', 'https://rna.ao/', 'website', 'review', false, false, 'Angola — Notícias, Economia e Investimentos', 'news_media', false),
  ('Nações Unidas em Angola', 'https://angola.un.org/pt/jobs', 'website', 'review', false, false, 'Organizações Internacionais — Emprego e Estágios', 'international_organization', false),
  ('UNICEF Careers', 'https://jobs.unicef.org/', 'website', 'review', false, false, 'Organizações Internacionais — Emprego e Estágios', 'international_organization', false),
  ('PNUD Angola', 'https://www.undp.org/angola/opportunities-and-bidding', 'website', 'review', false, false, 'Organizações Internacionais — Emprego e Estágios', 'international_organization', false),
  ('Banco Africano de Desenvolvimento', 'https://www.afdb.org/en/about-us/careers', 'website', 'review', false, false, 'Organizações Internacionais — Emprego e Estágios', 'international_organization', false),
  ('União Africana', 'https://au.int/en/jobs', 'website', 'review', false, false, 'Organizações Internacionais — Emprego e Estágios', 'international_organization', false),
  ('Organização Mundial da Saúde', 'https://www.who.int/careers', 'website', 'review', false, false, 'Organizações Internacionais — Emprego e Estágios', 'international_organization', false),
  ('Organização Internacional do Trabalho', 'https://www.ilo.org/', 'website', 'review', false, false, 'Organizações Internacionais — Emprego e Estágios', 'international_organization', false),
  ('FAO', 'https://www.fao.org/employment/', 'website', 'review', false, false, 'Organizações Internacionais — Emprego e Estágios', 'international_organization', false),
  ('Programa Alimentar Mundial', 'https://www.wfp.org/careers', 'website', 'review', false, false, 'Organizações Internacionais — Emprego e Estágios', 'international_organization', false),
  ('ACNUR', 'https://www.unhcr.org/careers', 'website', 'review', false, false, 'Organizações Internacionais — Emprego e Estágios', 'international_organization', false),
  ('Organização Internacional para as Migrações', 'https://www.iom.int/careers', 'website', 'review', false, false, 'Organizações Internacionais — Emprego e Estágios', 'international_organization', false),
  ('UNESCO', 'https://careers.unesco.org/', 'website', 'review', false, false, 'Organizações Internacionais — Emprego e Estágios', 'international_organization', false),
  ('UN Careers', 'https://careers.un.org/', 'website', 'review', false, false, 'Organizações Internacionais — Emprego e Estágios', 'international_organization', false),
  ('INAGBE Angola', 'https://www.inagbe.gov.ao/', 'website', 'review', false, false, 'Bolsas de Estudo Nacionais e Internacionais', 'scholarship_provider', false),
  ('Chevening Scholarships', 'https://www.chevening.org/scholarship/angola/', 'website', 'review', false, false, 'Bolsas de Estudo Nacionais e Internacionais', 'scholarship_provider', false),
  ('Erasmus+', 'https://erasmus-plus.ec.europa.eu/', 'website', 'review', false, false, 'Bolsas de Estudo Nacionais e Internacionais', 'scholarship_provider', false),
  ('DAAD Alemanha', 'https://www.daad.de/en/', 'website', 'review', false, false, 'Bolsas de Estudo Nacionais e Internacionais', 'scholarship_provider', false),
  ('Campus France', 'https://www.campusfrance.org/', 'website', 'review', false, false, 'Bolsas de Estudo Nacionais e Internacionais', 'scholarship_provider', false),
  ('Commonwealth Scholarships', 'https://cscuk.fcdo.gov.uk/', 'website', 'review', false, false, 'Bolsas de Estudo Nacionais e Internacionais', 'scholarship_provider', false),
  ('Mastercard Foundation', 'https://mastercardfdn.org/', 'website', 'review', false, false, 'Bolsas de Estudo Nacionais e Internacionais', 'scholarship_provider', false),
  ('Türkiye Scholarships', 'https://www.turkiyeburslari.gov.tr/', 'website', 'review', false, false, 'Bolsas de Estudo Nacionais e Internacionais', 'scholarship_provider', false),
  ('MEXT Japão / Study in Japan', 'https://www.studyinjapan.go.jp/en/', 'website', 'review', false, false, 'Bolsas de Estudo Nacionais e Internacionais', 'scholarship_provider', false),
  ('Study in China', 'https://www.campuschina.org/', 'website', 'review', false, false, 'Bolsas de Estudo Nacionais e Internacionais', 'scholarship_provider', false),
  ('EducationUSA', 'https://educationusa.state.gov/', 'website', 'review', false, false, 'Bolsas de Estudo Nacionais e Internacionais', 'scholarship_provider', false),
  ('Banco Africano de Desenvolvimento — RSS Feeds', 'https://www.afdb.org/en/rss-feeds', 'website', 'review', false, false, 'RSS, APIs e Fontes de Dados', 'data_source', false),
  ('UN Talent', 'https://untalent.org/open', 'website', 'review', false, false, 'RSS, APIs e Fontes de Dados', 'data_source', false),
  ('World Bank API', 'https://api.worldbank.org/', 'website', 'review', false, false, 'RSS, APIs e Fontes de Dados', 'data_source', false),
  ('World Bank Projects', 'https://projects.worldbank.org/', 'website', 'review', false, false, 'RSS, APIs e Fontes de Dados', 'data_source', false),
  ('UN Global Marketplace', 'https://www.ungm.org/', 'website', 'review', false, false, 'RSS, APIs e Fontes de Dados', 'data_source', false),
  ('INEFOP Angola', 'https://www.inefop.gov.ao/', 'website', 'review', false, false, 'Formação Profissional e Cursos', 'training_provider', false),
  ('Coursera', 'https://www.coursera.org/', 'website', 'review', false, false, 'Formação Profissional e Cursos', 'training_provider', false),
  ('edX', 'https://www.edx.org/', 'website', 'review', false, false, 'Formação Profissional e Cursos', 'training_provider', false),
  ('Cisco Networking Academy', 'https://www.netacad.com/', 'website', 'review', false, false, 'Formação Profissional e Cursos', 'training_provider', false),
  ('Microsoft Learn', 'https://learn.microsoft.com/', 'website', 'review', false, false, 'Formação Profissional e Cursos', 'training_provider', false),
  ('Google Skillshop', 'https://skillshop.withgoogle.com/', 'website', 'review', false, false, 'Formação Profissional e Cursos', 'training_provider', false),
  ('IBM SkillsBuild', 'https://skillsbuild.org/', 'website', 'review', false, false, 'Formação Profissional e Cursos', 'training_provider', false),
  ('Alison', 'https://alison.com/', 'website', 'review', false, false, 'Formação Profissional e Cursos', 'training_provider', false)
on conflict (source_url) do nothing;

alter table public.opportunities
  add column if not exists public_summary text,
  add column if not exists candidate_image_url text,
  add column if not exists candidate_image_source_url text,
  add column if not exists collection_method text not null default 'manual',
  add column if not exists auto_review_status text not null default 'not_applicable',
  add column if not exists auto_reviewed_at timestamptz,
  add column if not exists auto_reviewed_by uuid references auth.users(id) on delete set null;

alter table public.opportunities
  drop constraint if exists opportunities_collection_method_check;
alter table public.opportunities
  add constraint opportunities_collection_method_check
  check (collection_method in ('manual', 'automatic'));

alter table public.opportunities
  drop constraint if exists opportunities_auto_review_status_check;
alter table public.opportunities
  add constraint opportunities_auto_review_status_check
  check (auto_review_status in ('not_applicable', 'pending', 'reviewed', 'dismissed'));

create index if not exists opportunities_auto_review_idx
  on public.opportunities (auto_review_status, published_at desc)
  where collection_method = 'automatic';
create unique index if not exists opportunities_auto_source_url_unique
  on public.opportunities (source_id, source_url)
  where collection_method = 'automatic';

create or replace function public.pulso_automation_host_allowed(
  p_url text,
  p_source_url text,
  p_allowed_hosts text[] default '{}'::text[]
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  candidate_host text;
  source_host text;
  permitted_host text;
begin
  if coalesce(p_url, '') !~* '^https://' then return false; end if;
  candidate_host := lower((pg_catalog.regexp_match(p_url, '^https://([^/:?#]+)'))[1]);
  source_host := lower((pg_catalog.regexp_match(coalesce(p_source_url, ''), '^https://([^/:?#]+)'))[1]);
  if candidate_host is null then return false; end if;
  if source_host is not null and (
    candidate_host = source_host
    or pg_catalog.right(candidate_host, pg_catalog.length(source_host) + 1) = '.' || source_host
  ) then return true; end if;
  foreach permitted_host in array coalesce(p_allowed_hosts, '{}'::text[]) loop
    permitted_host := lower(pg_catalog.btrim(permitted_host));
    if permitted_host <> '' and (
      candidate_host = permitted_host
      or pg_catalog.right(candidate_host, pg_catalog.length(permitted_host) + 1) = '.' || permitted_host
    ) then return true; end if;
  end loop;
  return false;
end;
$function$;
revoke all on function public.pulso_automation_host_allowed(text, text, text[]) from public, anon, authenticated;

create or replace function public.pulso_record_automatic_opportunity(
  p_source_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  source_row public.sources%rowtype;
  org_id uuid;
  opportunity_id uuid;
  organization_name text;
  source_item_url text;
  apply_url text;
  due_date date;
  category_value text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the server-side collector may publish automatic opportunities.';
  end if;

  select * into source_row
  from public.sources
  where id = p_source_id
    and active = true
    and access_status = 'authorized'
    and collection_enabled = true
    and collection_endpoint is not null
    and collection_format is not null
  for share;
  if not found then
    raise exception 'The source is not enabled and authorized for collection.';
  end if;

  source_item_url := pg_catalog.btrim(coalesce(p_payload ->> 'source_url', ''));
  apply_url := nullif(pg_catalog.btrim(coalesce(p_payload ->> 'application_url', '')), '');
  category_value := coalesce(p_payload ->> 'category', '');
  organization_name := pg_catalog.left(pg_catalog.btrim(coalesce(p_payload ->> 'organization_name', source_row.name)), 160);

  if category_value not in ('employment', 'scholarship', 'public_competition', 'internship', 'training', 'recruitment_program') then
    raise exception 'Unsupported opportunity category.';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_payload ->> 'title', ''))) < 10
     or pg_catalog.length(pg_catalog.btrim(coalesce(p_payload ->> 'title', ''))) > 180 then
    raise exception 'The title length is invalid.';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_payload ->> 'description', ''))) < 30
     or pg_catalog.length(coalesce(p_payload ->> 'description', '')) > 5000 then
    raise exception 'The opportunity description is missing or too long.';
  end if;
  if organization_name = '' then raise exception 'The organization name is required.'; end if;
  if not public.pulso_automation_host_allowed(source_item_url, source_row.source_url, source_row.collection_allowed_hosts) then
    raise exception 'The opportunity URL is not HTTPS or is outside the approved source domains.';
  end if;
  if apply_url is not null and not public.pulso_automation_host_allowed(apply_url, source_row.source_url, source_row.collection_allowed_hosts) then
    raise exception 'The application URL is outside the approved source domains.';
  end if;
  if source_row.source_class = 'news_media' and apply_url is not null
     and lower((pg_catalog.regexp_match(apply_url, '^https://([^/:?#]+)'))[1])
       = lower((pg_catalog.regexp_match(source_row.source_url, '^https://([^/:?#]+)'))[1]) then
    raise exception 'A news item needs a direct, approved primary application link.';
  end if;
  if nullif(p_payload ->> 'application_deadline', '') is not null then
    due_date := (p_payload ->> 'application_deadline')::date;
    if due_date < current_date then raise exception 'The application deadline has passed.'; end if;
  end if;
  if nullif(p_payload ->> 'image_url', '') is not null
     and (p_payload ->> 'image_url') !~* '^https://' then
    raise exception 'An image URL must use HTTPS.';
  end if;

  select id into opportunity_id
  from public.opportunities
  where source_id = p_source_id
    and source_url = source_item_url
    and collection_method = 'automatic'
  limit 1;
  if opportunity_id is not null then
    return pg_catalog.jsonb_build_object('created', false, 'id', opportunity_id, 'reason', 'duplicate');
  end if;

  select id into org_id
  from public.organizations
  where verification_status = 'verified'
    and (
      lower(coalesce(official_website, '')) = lower(source_row.source_url)
      or lower(name) = lower(organization_name)
    )
  order by case when lower(name) = lower(organization_name) then 0 else 1 end, created_at asc
  limit 1;
  if org_id is null then
    insert into public.organizations (name, official_website, verification_status)
    values (organization_name, null, 'pending')
    returning id into org_id;
  end if;

  insert into public.opportunities (
    organization_id, source_id, title, description, public_summary, category,
    sector, province, municipality, vacancies, requirements, education_level,
    experience, application_deadline, published_at, source_name, source_url,
    application_url, image_url, image_source_url, candidate_image_url,
    candidate_image_source_url, image_rights_confirmed, status,
    verification_status, collection_method, auto_review_status
  ) values (
    org_id, p_source_id,
    pg_catalog.btrim(p_payload ->> 'title'),
    pg_catalog.btrim(p_payload ->> 'description'),
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'public_summary', '')), ''),
    category_value,
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_payload ->> 'sector', '')), 120), ''),
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_payload ->> 'province', '')), 100), ''),
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_payload ->> 'municipality', '')), 100), ''),
    nullif(p_payload ->> 'vacancies', '')::integer,
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_payload ->> 'requirements', '')), 3000), ''),
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_payload ->> 'education_level', '')), 200), ''),
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_payload ->> 'experience', '')), 200), ''),
    due_date,
    coalesce(nullif(p_payload ->> 'published_at', '')::timestamptz, now()),
    source_row.name, source_item_url, coalesce(apply_url, source_item_url),
    nullif(p_payload ->> 'image_url', ''),
    case when nullif(p_payload ->> 'image_url', '') is null then null else source_item_url end,
    nullif(p_payload ->> 'image_url', ''),
    case when nullif(p_payload ->> 'image_url', '') is null then null else source_item_url end,
    nullif(p_payload ->> 'image_url', '') is not null,
    'pending_review', 'unverified', 'automatic', 'pending'
  )
  on conflict (source_id, source_url) where (collection_method = 'automatic') do nothing
  returning id into opportunity_id;

  if opportunity_id is null then
    select id into opportunity_id
    from public.opportunities
    where source_id = p_source_id and source_url = source_item_url and collection_method = 'automatic'
    limit 1;
    return pg_catalog.jsonb_build_object('created', false, 'id', opportunity_id, 'reason', 'duplicate');
  end if;
  -- The server-only collector has checked two AI passes, source URLs, dates,
  -- category and duplicates. Publish the verified link fields; image files are
  -- never downloaded, and the administrator can review or withdraw afterwards.
  update public.organizations
  set verification_status = 'verified'
  where id = org_id;
  update public.opportunities
  set status = 'published', verification_status = 'verified'
  where id = opportunity_id;
  return pg_catalog.jsonb_build_object('created', true, 'id', opportunity_id, 'review_status', 'pending');
end;
$function$;
revoke all on function public.pulso_record_automatic_opportunity(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.pulso_record_automatic_opportunity(uuid, jsonb) to service_role;

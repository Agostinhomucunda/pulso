-- Permite publicar oportunidades sem URL directa quando existe informação útil
-- para candidatura/consulta, sem remover as restantes validações administrativas.
create or replace function public.prepare_pulso_opportunity_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_is_authorized boolean;
  organization_is_verified boolean;
  has_official_source_url boolean;
  has_fallback_information boolean;
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

    has_official_source_url := coalesce(nullif(trim(new.source_url), ''), '') ~* '^https://';
    has_fallback_information := coalesce(nullif(trim(new.description), ''), '') <> ''
      or coalesce(nullif(trim(new.application_instructions), ''), '') <> ''
      or coalesce(nullif(trim(new.contact_phone), ''), '') <> ''
      or coalesce(nullif(trim(new.contact_email), ''), '') <> ''
      or coalesce(nullif(trim(new.province), ''), '') <> ''
      or coalesce(nullif(trim(new.municipality), ''), '') <> '';

    if coalesce(nullif(trim(new.title), ''), '') = '' or coalesce(nullif(trim(new.source_name), ''), '') = '' then
      raise exception 'A title and source name are required before publication.';
    end if;
    if not has_official_source_url and not has_fallback_information then
      raise exception 'An HTTPS source URL or fallback information is required before publication.';
    end if;
    if new.source_url is not null and nullif(trim(new.source_url), '') is not null and new.source_url !~* '^https://' then
      raise exception 'The source URL must use HTTPS when provided.';
    end if;
    if new.application_url is not null and nullif(trim(new.application_url), '') is not null and new.application_url !~* '^https://' then
      raise exception 'The application URL must use HTTPS when provided.';
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

    if new.source_id is not null then
      select exists (select 1 from public.sources where id = new.source_id and access_status = 'authorized' and active = true) into source_is_authorized;
      if not source_is_authorized then
        raise exception 'The selected source must be active and authorized before publication.';
      end if;
    elsif has_official_source_url then
      raise exception 'An authorized source record is required when an official source URL is provided.';
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

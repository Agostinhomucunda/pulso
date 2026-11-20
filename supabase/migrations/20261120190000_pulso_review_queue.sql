-- PULSO: administrator review and withdrawal after automatic publication.
-- Apply after 20261119140000_manual_opportunity_admin.sql and 20261120180000_pulso_ai_automation.sql.

create or replace function public.pulso_review_automatic_opportunity(
  p_opportunity_id uuid,
  p_action text,
  p_organization_website text default null,
  p_image_rights_confirmed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  opportunity_row public.opportunities%rowtype;
begin
  if not public.is_pulso_admin() then
    raise exception 'Only PULSO administrators may review automatic opportunities.';
  end if;
  if p_action not in ('approve', 'dismiss') then
    raise exception 'Unsupported review action.';
  end if;

  select * into opportunity_row
  from public.opportunities
  where id = p_opportunity_id
    and collection_method = 'automatic'
    and auto_review_status = 'pending'
  for update;
  if not found then raise exception 'The automatic opportunity is no longer pending review.'; end if;

  if p_action = 'dismiss' then
    update public.opportunities
    set auto_review_status = 'dismissed',
        auto_reviewed_at = now(),
        auto_reviewed_by = auth.uid(),
        status = 'rejected',
        verification_status = 'unverified'
    where id = p_opportunity_id;
    return pg_catalog.jsonb_build_object('reviewed', true, 'published', false);
  end if;

  if opportunity_row.organization_id is null then
    raise exception 'An organization must be associated before approval.';
  end if;
  if p_organization_website is not null and p_organization_website !~* '^https://' then
    raise exception 'The organization website must use HTTPS.';
  end if;
  if p_image_rights_confirmed and opportunity_row.candidate_image_url is null then
    raise exception 'There is no candidate image to approve.';
  end if;
  if p_organization_website is not null then
    update public.organizations
    set official_website = p_organization_website
    where id = opportunity_row.organization_id;
    if not found then raise exception 'The associated organization could not be updated.'; end if;
  end if;

  update public.opportunities
  set auto_review_status = 'reviewed',
      auto_reviewed_at = now(),
      auto_reviewed_by = auth.uid(),
      image_rights_confirmed = case when p_image_rights_confirmed then true else image_rights_confirmed end,
      image_url = case when p_image_rights_confirmed then candidate_image_url else image_url end,
      image_source_url = case when p_image_rights_confirmed then candidate_image_source_url else image_source_url end
  where id = p_opportunity_id;

  return pg_catalog.jsonb_build_object('reviewed', true, 'published', true);
end;
$function$;

revoke all on function public.pulso_review_automatic_opportunity(uuid, text, text, boolean) from public, anon;
grant execute on function public.pulso_review_automatic_opportunity(uuid, text, text, boolean) to authenticated;

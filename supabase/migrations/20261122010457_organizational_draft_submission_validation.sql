-- Keep draft-to-review updates subject to the same source and image checks as inserts.
-- This migration changes policy only; it does not modify existing opportunity records.
drop policy if exists organizational_opportunity_draft_submit on public.opportunities;
create policy organizational_opportunity_draft_submit
  on public.opportunities for update to authenticated
  using (submitted_by_user_id = (select auth.uid()) and status = 'draft')
  with check (
    submitted_by_user_id = (select auth.uid())
    and status in ('draft','pending_review')
    and verification_status = 'unverified'
    and review_note is null
    and created_by = (select auth.uid())
    and reviewed_by is null and reviewed_at is null
    and published_by is null and posted_at is null
    and (withdrawn_by is null and withdrawn_at is null)
    and (
      (submission_kind = 'business' and organization_id is not null
        and public.pulso_business_submission_allowed(organization_id))
      or
      (submission_kind = 'partner' and organization_id is null and public.pulso_partner_submission_allowed())
    )
    and source_id is null and collection_method = 'manual'
    and source_url ~* '^https://'
    and (application_url is null or application_url ~* '^https://')
    and (image_url is null or (
      image_url ~* '^https://' and coalesce(image_source_url, '') ~* '^https://'
      and image_rights_confirmed is true
    ))
    and created_by = (select auth.uid())
    and published_at is null
    and reviewed_by is null and reviewed_at is null
    and published_by is null and posted_at is null
    and withdrawn_by is null and withdrawn_at is null
  );

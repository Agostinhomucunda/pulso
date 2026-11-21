-- PULSO Stage 2: role routing, organization ownership, moderated submissions and status history.
-- Additive only. Review and apply manually to the active Supabase project before publishing app code.
-- No existing records are deleted or automatically promoted.

alter table public.business_verification_requests
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;

alter table public.partnership_requests
  add column if not exists allow_opportunity_submissions boolean not null default false;

alter table public.opportunities
  add column if not exists submitted_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists submission_kind text,
  add column if not exists review_note text;

alter table public.opportunities
  drop constraint if exists opportunities_submission_kind_check;
alter table public.opportunities
  add constraint opportunities_submission_kind_check
  check (submission_kind is null or submission_kind in ('business', 'partner'));

alter table public.opportunities
  drop constraint if exists opportunities_category_check;
alter table public.opportunities
  add constraint opportunities_category_check
  check (category in ('employment','scholarship','public_competition','internship','training','recruitment_program','other'));

create index if not exists business_requests_organization_idx
  on public.business_verification_requests (organization_id, user_id);
create index if not exists organizational_opportunity_submitter_idx
  on public.opportunities (submitted_by_user_id, created_at desc)
  where submitted_by_user_id is not null;

create table if not exists public.organizational_account_status_history (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('business','partnership')),
  request_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  previous_status text,
  new_status text not null,
  status_note text,
  actor_user_id uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists organizational_account_history_owner_idx
  on public.organizational_account_status_history (user_id, changed_at desc);
alter table public.organizational_account_status_history
  add column if not exists previous_submission_permission boolean,
  add column if not exists new_submission_permission boolean;

create table if not exists public.opportunity_submission_history (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  previous_status text,
  new_status text not null,
  previous_verification_status text,
  new_verification_status text not null,
  note text,
  actor_user_id uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists opportunity_submission_history_owner_idx
  on public.opportunity_submission_history (owner_user_id, changed_at desc);
create index if not exists opportunity_submission_history_opportunity_idx
  on public.opportunity_submission_history (opportunity_id, changed_at desc);

alter table public.organizational_account_status_history enable row level security;
alter table public.opportunity_submission_history enable row level security;
revoke all on public.organizational_account_status_history, public.opportunity_submission_history from public, anon, authenticated;
grant select on public.organizational_account_status_history, public.opportunity_submission_history to authenticated;

drop policy if exists organizational_account_history_owner_read on public.organizational_account_status_history;
create policy organizational_account_history_owner_read
  on public.organizational_account_status_history for select to authenticated
  using (user_id = (select auth.uid()) or public.is_pulso_admin());
drop policy if exists opportunity_submission_history_owner_read on public.opportunity_submission_history;
create policy opportunity_submission_history_owner_read
  on public.opportunity_submission_history for select to authenticated
  using (owner_user_id = (select auth.uid()) or public.is_pulso_admin());

-- Request owners can read their own submissions after approval/suspension, but only an
-- administrator can change account status, link an organization, or grant partner privileges.
drop policy if exists business_requests_owner_read on public.business_verification_requests;
create policy business_requests_owner_read on public.business_verification_requests
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists partnership_requests_owner_read on public.partnership_requests;
create policy partnership_requests_owner_read on public.partnership_requests
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.audit_pulso_organizational_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_type text;
  v_history_note text;
  v_previous_permission boolean;
  v_new_permission boolean;
  v_permission_changed boolean := false;
begin
  if tg_table_name = 'business_verification_requests' then
    v_request_type := 'business';
  elsif tg_table_name = 'partnership_requests' then
    v_request_type := 'partnership';
  else
    raise exception 'Unsupported PULSO status-history table.';
  end if;

  v_history_note := new.status_note;
  if v_request_type = 'partnership' then
    v_new_permission := new.allow_opportunity_submissions;
    if tg_op = 'UPDATE' then
      v_previous_permission := old.allow_opportunity_submissions;
      v_permission_changed := old.allow_opportunity_submissions is distinct from new.allow_opportunity_submissions;
      if v_permission_changed then
        v_history_note := concat_ws(' · ', nullif(btrim(new.status_note), ''),
          case when new.allow_opportunity_submissions then 'Permissão para submeter oportunidades concedida.'
               else 'Permissão para submeter oportunidades revogada.' end);
      end if;
    end if;
  end if;

  if tg_op = 'INSERT' or old.status is distinct from new.status
     or old.status_note is distinct from new.status_note or v_permission_changed then
    insert into public.organizational_account_status_history (
      request_type, request_id, user_id, previous_status, new_status, status_note,
      previous_submission_permission, new_submission_permission, actor_user_id
    ) values (
      v_request_type, new.id, new.user_id,
      case when tg_op = 'INSERT' then null else old.status end,
      new.status, v_history_note, v_previous_permission, v_new_permission, auth.uid()
    );
  end if;
  return new;
end;
$$;
revoke all on function public.audit_pulso_organizational_status() from public, anon, authenticated;
drop trigger if exists audit_pulso_business_request_status on public.business_verification_requests;
create trigger audit_pulso_business_request_status
  after insert or update on public.business_verification_requests
  for each row execute function public.audit_pulso_organizational_status();
drop trigger if exists audit_pulso_partnership_request_status on public.partnership_requests;
create trigger audit_pulso_partnership_request_status
  after insert or update on public.partnership_requests
  for each row execute function public.audit_pulso_organizational_status();

create or replace function public.audit_pulso_opportunity_submission_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.submitted_by_user_id is not null then
      insert into public.opportunity_submission_history (
        opportunity_id, owner_user_id, previous_status, new_status,
        previous_verification_status, new_verification_status, note, actor_user_id
      ) values (
        new.id, new.submitted_by_user_id, null, new.status,
        null, new.verification_status, new.review_note, auth.uid()
      );
    end if;
    return new;
  end if;

  if new.submitted_by_user_id is not null and (
    old.status is distinct from new.status
    or old.verification_status is distinct from new.verification_status
    or old.review_note is distinct from new.review_note
  ) then
    insert into public.opportunity_submission_history (
      opportunity_id, owner_user_id, previous_status, new_status,
      previous_verification_status, new_verification_status, note, actor_user_id
    ) values (
      new.id, new.submitted_by_user_id, old.status, new.status,
      old.verification_status, new.verification_status, new.review_note, auth.uid()
    );
  end if;
  return new;
end;
$$;
revoke all on function public.audit_pulso_opportunity_submission_status() from public, anon, authenticated;
drop trigger if exists audit_pulso_opportunity_submission_status on public.opportunities;
create trigger audit_pulso_opportunity_submission_status
  after insert or update on public.opportunities
  for each row execute function public.audit_pulso_opportunity_submission_status();

-- Only the existing administrator allow-list can approve a business application.
-- Approval atomically creates a verified organizations row or links an explicitly selected one.
create or replace function public.review_pulso_business_request(
  p_request_id uuid,
  p_status text,
  p_status_note text default null,
  p_organization_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.business_verification_requests%rowtype;
  v_organization_id uuid;
begin
  if not public.is_pulso_admin() then
    raise exception 'Administrator access is required.';
  end if;
  if p_status not in ('under_review','additional_documents_requested','verified','rejected','suspended') then
    raise exception 'Invalid business verification status.';
  end if;
  if length(coalesce(p_status_note, '')) > 2000 then
    raise exception 'The review note is too long.';
  end if;

  select * into v_request
  from public.business_verification_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'Business verification request not found.'; end if;

  v_organization_id := v_request.organization_id;
  if p_status = 'verified' then
    if p_organization_id is not null then
      select id into v_organization_id
      from public.organizations
      where id = p_organization_id and verification_status = 'verified';
      if v_organization_id is null then
        raise exception 'Select an existing verified organization or create one from this reviewed request.';
      end if;
    elsif v_organization_id is null or not exists (
      select 1 from public.organizations
      where id = v_organization_id and verification_status = 'verified'
    ) then
      insert into public.organizations (
        name, sector, province, municipality, official_website, verification_status
      ) values (
        coalesce(nullif(btrim(v_request.trade_name), ''), v_request.legal_name),
        v_request.sector, v_request.province, v_request.municipality,
        case when v_request.website ~* '^https://' then v_request.website else null end,
        'verified'
      ) returning id into v_organization_id;
    end if;
  end if;

  update public.business_verification_requests
  set status = p_status,
      status_note = nullif(btrim(p_status_note), ''),
      organization_id = v_organization_id,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id;
  return v_organization_id;
end;
$$;
revoke all on function public.review_pulso_business_request(uuid,text,text,uuid) from public, anon;
grant execute on function public.review_pulso_business_request(uuid,text,text,uuid) to authenticated;

-- Partnership approval is distinct from company verification. Submission permission is opt-in
-- per approved request and is revoked automatically for every other status.
create or replace function public.review_pulso_partnership_request(
  p_request_id uuid,
  p_status text,
  p_status_note text default null,
  p_allow_opportunity_submissions boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_pulso_admin() then
    raise exception 'Administrator access is required.';
  end if;
  if p_status not in ('received','under_review','additional_information_requested','approved','rejected','suspended') then
    raise exception 'Invalid partnership status.';
  end if;
  if length(coalesce(p_status_note, '')) > 2000 then
    raise exception 'The review note is too long.';
  end if;

  update public.partnership_requests
  set status = p_status,
      status_note = nullif(btrim(p_status_note), ''),
      allow_opportunity_submissions = (p_status = 'approved' and coalesce(p_allow_opportunity_submissions, false)),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id;
  if not found then raise exception 'Partnership request not found.'; end if;
end;
$$;
revoke all on function public.review_pulso_partnership_request(uuid,text,text,boolean) from public, anon;
grant execute on function public.review_pulso_partnership_request(uuid,text,text,boolean) to authenticated;

-- Only the latest request of each modality can grant submission access. This prevents an
-- older approved request from restoring access after a newer suspension/rejection.
create or replace function public.pulso_business_submission_allowed(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_verification_requests r
    join public.organizations org on org.id = r.organization_id
    where r.user_id = (select auth.uid())
      and r.status = 'verified'
      and r.organization_id = p_organization_id
      and org.verification_status = 'verified'
      and not exists (
        select 1 from public.business_verification_requests newer
        where newer.user_id = r.user_id
          and (newer.created_at, newer.id) > (r.created_at, r.id)
      )
  );
$$;
create or replace function public.pulso_partner_submission_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.partnership_requests r
    where r.user_id = (select auth.uid())
      and r.status = 'approved'
      and r.allow_opportunity_submissions is true
      and not exists (
        select 1 from public.partnership_requests newer
        where newer.user_id = r.user_id
          and (newer.created_at, newer.id) > (r.created_at, r.id)
      )
  );
$$;
revoke all on function public.pulso_business_submission_allowed(uuid), public.pulso_partner_submission_allowed() from public, anon;
grant execute on function public.pulso_business_submission_allowed(uuid), public.pulso_partner_submission_allowed() to authenticated;

-- Owners can read only their own submitted opportunity rows; admins retain the existing all-row policy.
drop policy if exists business_opportunity_submission_owner_read on public.opportunities;
create policy business_opportunity_submission_owner_read
  on public.opportunities for select to authenticated
  using (submitted_by_user_id = (select auth.uid()));

-- A verified business owner may create drafts or submissions only for the exact linked verified organization.
drop policy if exists business_opportunity_submission_insert on public.opportunities;
create policy business_opportunity_submission_insert
  on public.opportunities for insert to authenticated
  with check (
    submitted_by_user_id = (select auth.uid())
    and submission_kind = 'business'
    and status in ('draft','pending_review')
    and verification_status = 'unverified'
    and organization_id is not null
    and source_id is null
    and coalesce(collection_method, 'manual') = 'manual'
    and source_url ~* '^https://'
    and (application_url is null or application_url ~* '^https://')
    and (image_url is null or (
      image_url ~* '^https://' and coalesce(image_source_url, '') ~* '^https://'
      and image_rights_confirmed is true
    ))
    and public.pulso_business_submission_allowed(organization_id)
    and created_by = (select auth.uid())
    and review_note is null and reviewed_by is null and reviewed_at is null
    and published_by is null and posted_at is null and published_at is null
    and withdrawn_by is null and withdrawn_at is null
  );

-- Partners may submit only if an administrator enabled that permission; partnership never
-- grants a verified-company organization link, source authorization, publication or admin access.
drop policy if exists partner_opportunity_submission_insert on public.opportunities;
create policy partner_opportunity_submission_insert
  on public.opportunities for insert to authenticated
  with check (
    submitted_by_user_id = (select auth.uid())
    and submission_kind = 'partner'
    and organization_id is null
    and status in ('draft','pending_review')
    and verification_status = 'unverified'
    and source_id is null
    and coalesce(collection_method, 'manual') = 'manual'
    and source_url ~* '^https://'
    and (application_url is null or application_url ~* '^https://')
    and (image_url is null or (
      image_url ~* '^https://' and coalesce(image_source_url, '') ~* '^https://'
      and image_rights_confirmed is true
    ))
    and public.pulso_partner_submission_allowed()
    and created_by = (select auth.uid())
    and review_note is null and reviewed_by is null and reviewed_at is null
    and published_by is null and posted_at is null and published_at is null
    and withdrawn_by is null and withdrawn_at is null
  );

-- A submitter may only turn their own draft into a review submission. Submitted rows are immutable to owners.
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
    and created_by = (select auth.uid())
    and published_at is null
    and reviewed_by is null and reviewed_at is null
    and published_by is null and posted_at is null
    and withdrawn_by is null and withdrawn_at is null
  );

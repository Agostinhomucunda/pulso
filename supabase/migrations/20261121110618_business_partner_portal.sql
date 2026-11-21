-- PULSO: pedidos empresariais e de parceria, isolados das tabelas existentes.
-- Documentos exclusivamente privados; aprovação por revisão humana autorizada.

create table if not exists public.business_verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  legal_name text not null check (btrim(legal_name) <> ''),
  trade_name text,
  tax_id text not null check (btrim(tax_id) <> ''),
  commercial_registration_number text,
  sector text not null,
  province text not null,
  municipality text not null,
  address text not null,
  website text,
  institutional_email text not null,
  organization_phone text not null,
  representative_full_name text not null,
  representative_role text not null,
  representative_email text not null,
  representative_phone text not null,
  consent_accepted boolean not null default false check (consent_accepted is true),
  status text not null default 'under_review'
    check (status in ('under_review','additional_documents_requested','verified','rejected','suspended')),
  status_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partnership_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_name text not null check (btrim(organization_name) <> ''),
  activity_description text not null,
  representative_name text not null,
  representative_email text not null,
  representative_phone text not null,
  province text not null,
  municipality text not null,
  website_or_social_links text,
  collaboration_type text not null,
  collaboration_reason text not null,
  consent_accepted boolean not null default false check (consent_accepted is true),
  status text not null default 'received'
    check (status in ('received','under_review','additional_information_requested','approved','rejected','suspended')),
  status_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_verification_documents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.business_verification_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null
    check (document_type in ('commercial_certificate','tax_document','business_license','representative_id','representation_proof','additional')),
  original_filename text not null,
  storage_path text not null unique,
  replaces_document_id uuid references public.business_verification_documents(id) on delete set null,
  status text not null default 'submitted'
    check (status in ('submitted','replacement_requested','accepted','rejected')),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint business_document_replacement_not_self check (replaces_document_id is null or replaces_document_id <> id)
);

create index if not exists business_verification_owner_created_idx
  on public.business_verification_requests (user_id, created_at desc);
create index if not exists partnership_owner_created_idx
  on public.partnership_requests (user_id, created_at desc);
create index if not exists business_documents_request_uploaded_idx
  on public.business_verification_documents (request_id, uploaded_at desc);
create index if not exists business_documents_owner_idx
  on public.business_verification_documents (user_id, request_id);

alter table public.business_verification_requests enable row level security;
alter table public.partnership_requests enable row level security;
alter table public.business_verification_documents enable row level security;

revoke all on public.business_verification_requests, public.partnership_requests,
  public.business_verification_documents from public, anon, authenticated;

grant select, update on public.business_verification_requests to authenticated;
grant insert (
  user_id, legal_name, trade_name, tax_id, commercial_registration_number, sector,
  province, municipality, address, website, institutional_email, organization_phone,
  representative_full_name, representative_role, representative_email,
  representative_phone, consent_accepted
) on public.business_verification_requests to authenticated;

grant select, update on public.partnership_requests to authenticated;
grant insert (
  user_id, organization_name, activity_description, representative_name,
  representative_email, representative_phone, province, municipality,
  website_or_social_links, collaboration_type, collaboration_reason, consent_accepted
) on public.partnership_requests to authenticated;

grant select, update on public.business_verification_documents to authenticated;
grant insert (
  request_id, user_id, document_type, original_filename, storage_path, replaces_document_id
) on public.business_verification_documents to authenticated;

drop policy if exists business_requests_owner_read on public.business_verification_requests;
create policy business_requests_owner_read on public.business_verification_requests
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists business_requests_owner_submit on public.business_verification_requests;
create policy business_requests_owner_submit on public.business_verification_requests
  for insert to authenticated
  with check (
    user_id = (select auth.uid()) and status = 'under_review'
    and consent_accepted is true and reviewed_by is null and reviewed_at is null
  );
drop policy if exists business_requests_admin_all on public.business_verification_requests;
create policy business_requests_admin_all on public.business_verification_requests
  for all to authenticated
  using (public.is_pulso_admin()) with check (public.is_pulso_admin());

drop policy if exists partnership_requests_owner_read on public.partnership_requests;
create policy partnership_requests_owner_read on public.partnership_requests
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists partnership_requests_owner_submit on public.partnership_requests;
create policy partnership_requests_owner_submit on public.partnership_requests
  for insert to authenticated
  with check (
    user_id = (select auth.uid()) and status = 'received'
    and consent_accepted is true and reviewed_by is null and reviewed_at is null
  );
drop policy if exists partnership_requests_admin_all on public.partnership_requests;
create policy partnership_requests_admin_all on public.partnership_requests
  for all to authenticated
  using (public.is_pulso_admin()) with check (public.is_pulso_admin());

drop policy if exists business_documents_owner_read on public.business_verification_documents;
create policy business_documents_owner_read on public.business_verification_documents
  for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists business_documents_owner_submit on public.business_verification_documents;
create policy business_documents_owner_submit on public.business_verification_documents
  for insert to authenticated
  with check (
    user_id = (select auth.uid()) and status = 'submitted'
    and reviewed_by is null and reviewed_at is null
    and exists (
      select 1 from public.business_verification_requests request
      where request.id = request_id
        and request.user_id = (select auth.uid())
        and request.status in ('under_review','additional_documents_requested')
    )
    and (
      replaces_document_id is null or exists (
        select 1 from public.business_verification_documents previous
        where previous.id = replaces_document_id
          and previous.request_id = request_id
          and previous.user_id = (select auth.uid())
      )
    )
  );
drop policy if exists business_documents_admin_all on public.business_verification_documents;
create policy business_documents_admin_all on public.business_verification_documents
  for all to authenticated
  using (public.is_pulso_admin()) with check (public.is_pulso_admin());

-- Private bucket. Only PDF and common image scans are accepted, with a 10 MiB/file cap.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pulso-business-documents', 'pulso-business-documents', false, 10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists pulso_business_documents_owner_read on storage.objects;
create policy pulso_business_documents_owner_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pulso-business-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.business_verification_requests request
      where request.id::text = (storage.foldername(name))[2]
        and request.user_id = (select auth.uid())
    )
  );
drop policy if exists pulso_business_documents_owner_insert on storage.objects;
create policy pulso_business_documents_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pulso-business-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.business_verification_requests request
      where request.id::text = (storage.foldername(name))[2]
        and request.user_id = (select auth.uid())
        and request.status in ('under_review','additional_documents_requested')
    )
  );
drop policy if exists pulso_business_documents_owner_cleanup on storage.objects;
create policy pulso_business_documents_owner_cleanup on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'pulso-business-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.business_verification_requests request
      where request.id::text = (storage.foldername(name))[2]
        and request.user_id = (select auth.uid())
        and request.status in ('under_review','additional_documents_requested')
    )
    and not exists (
      select 1 from public.business_verification_documents document
      where document.storage_path = name
    )
  );
drop policy if exists pulso_business_documents_admin_all on storage.objects;
create policy pulso_business_documents_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'pulso-business-documents' and public.is_pulso_admin())
  with check (bucket_id = 'pulso-business-documents' and public.is_pulso_admin());

-- Corrige a referência à linha externa na policy de substituição documental.
-- A migration inicial do portal já foi aplicada; esta alteração preserva o histórico.
drop policy if exists business_documents_owner_submit
  on public.business_verification_documents;

create policy business_documents_owner_submit
  on public.business_verification_documents
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'submitted'
    and reviewed_by is null
    and reviewed_at is null
    and exists (
      select 1 from public.business_verification_requests request
      where request.id = business_verification_documents.request_id
        and request.user_id = (select auth.uid())
        and request.status in ('under_review','additional_documents_requested')
    )
    and (
      business_verification_documents.replaces_document_id is null
      or exists (
        select 1 from public.business_verification_documents previous
        where previous.id = business_verification_documents.replaces_document_id
          and previous.request_id = business_verification_documents.request_id
          and previous.user_id = (select auth.uid())
      )
    )
  );

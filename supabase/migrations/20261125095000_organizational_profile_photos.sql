-- PULSO: fotografia de perfil comprimida para espaços empresariais e de parceiros.
alter table public.business_verification_requests
  add column if not exists profile_photo_url text,
  add column if not exists profile_photo_path text;

alter table public.partnership_requests
  add column if not exists profile_photo_url text,
  add column if not exists profile_photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pulso-organizational-profile-photos',
  'pulso-organizational-profile-photos',
  true,
  1048576,
  array['image/webp']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists pulso_org_profile_photos_owner_insert on storage.objects;
create policy pulso_org_profile_photos_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pulso-organizational-profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.extension(name)) = 'webp'
  );

drop policy if exists pulso_org_profile_photos_owner_delete on storage.objects;
create policy pulso_org_profile_photos_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'pulso-organizational-profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists pulso_org_profile_photos_admin_all on storage.objects;
create policy pulso_org_profile_photos_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'pulso-organizational-profile-photos' and public.is_pulso_admin())
  with check (bucket_id = 'pulso-organizational-profile-photos' and public.is_pulso_admin());

create or replace function public.save_organizational_profile_photo(
  p_request_id uuid,
  p_profile_photo_url text,
  p_profile_photo_path text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_profile_photo_url is null or p_profile_photo_url !~ '^https://'
     or p_profile_photo_path is null
     or p_profile_photo_path !~ ('^' || (select auth.uid())::text || '/[0-9a-f-]+\\.webp$') then
    raise exception 'Dados da fotografia de perfil inválidos.';
  end if;

  if exists (
    select 1 from public.business_verification_requests
    where id = p_request_id and user_id = (select auth.uid()) and status = 'verified'
  ) then
    update public.business_verification_requests
      set profile_photo_url = p_profile_photo_url,
          profile_photo_path = p_profile_photo_path,
          updated_at = now()
      where id = p_request_id and user_id = (select auth.uid());
    return true;
  end if;

  if exists (
    select 1 from public.partnership_requests
    where id = p_request_id and user_id = (select auth.uid()) and status = 'approved'
  ) then
    update public.partnership_requests
      set profile_photo_url = p_profile_photo_url,
          profile_photo_path = p_profile_photo_path,
          updated_at = now()
      where id = p_request_id and user_id = (select auth.uid());
    return true;
  end if;

  raise exception 'A conta não está autorizada a alterar esta fotografia.';
end;
$$;

grant execute on function public.save_organizational_profile_photo(uuid, text, text) to authenticated;

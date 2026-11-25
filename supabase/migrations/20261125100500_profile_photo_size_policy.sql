-- PULSO: fotos originais até 3 MB; armazenamento final até 900 KB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pulso-organizational-profile-photos',
  'pulso-organizational-profile-photos',
  true,
  1048576,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update set
  public = true,
  file_size_limit = 1048576,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists pulso_org_profile_photos_owner_insert on storage.objects;
create policy pulso_org_profile_photos_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pulso-organizational-profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

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
     or p_profile_photo_path !~ ('^' || (select auth.uid())::text || '/[0-9a-f-]+[.](jpg|jpeg|png|webp)$') then
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

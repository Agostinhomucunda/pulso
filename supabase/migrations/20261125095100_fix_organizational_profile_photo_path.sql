-- Corrige a expressão do caminho WEBP da RPC de fotografia de perfil.
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
     or p_profile_photo_path !~ ('^' || (select auth.uid())::text || '/[0-9a-f-]+[.]webp$') then
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

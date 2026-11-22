-- Métricas sociais iniciais para o feed comunitário.
-- O valor inicial é apenas uma base visual; as interacções reais continuam a ser guardadas.

alter table public.community_posts
  add column if not exists comment_seed_count integer not null default (20 + floor(random() * 31))::integer,
  add column if not exists shares_count integer not null default (13 + floor(random() * 3))::integer,
  add column if not exists saves_count integer not null default (20 + floor(random() * 31))::integer;

alter table public.community_posts
  alter column views_count set default (500 + floor(random() * 801))::integer,
  alter column comments_count set default (20 + floor(random() * 31))::integer;

update public.community_posts
set comment_seed_count = case when comment_seed_count < 20 then (20 + floor(random() * 31))::integer else comment_seed_count end,
    comments_count = case when comments_count < comment_seed_count then comment_seed_count else comments_count end,
    views_count = case when views_count < 500 then (500 + floor(random() * 801))::integer else views_count end
where status <> 'deleted';

create or replace function public.sync_community_post_counts()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_id uuid;
begin
  target_id := coalesce(new.post_id, old.post_id);
  update public.community_posts
  set likes_count = (select count(*)::integer from public.community_post_likes where post_id = target_id),
      comments_count = comment_seed_count + (select count(*)::integer from public.community_post_comments where post_id = target_id),
      updated_at = now()
  where id = target_id;
  return coalesce(new, old);
end; $$;
revoke all on function public.sync_community_post_counts() from public, anon, authenticated;

drop function if exists public.record_community_post_share(uuid);
create function public.record_community_post_share(p_post_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare current_shares integer;
begin
  update public.community_posts set shares_count = least(shares_count + 1, 2147483647)
  where id = p_post_id and status = 'active' returning shares_count into current_shares;
  return current_shares;
end; $$;
grant execute on function public.record_community_post_share(uuid) to anon, authenticated;

-- A publicação social não obriga localização: esses detalhes podem ser pedidos nos comentários.
alter table public.community_posts
  alter column work_location drop not null,
  alter column neighborhood drop not null,
  alter column province drop not null;

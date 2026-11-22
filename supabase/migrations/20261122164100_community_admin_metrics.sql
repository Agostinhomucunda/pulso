-- Métricas institucionais das publicações Pulso Comunidade.
-- like_seed_count preserva a contagem inicial mesmo quando utilizadores começam a gostar.

alter table public.community_posts
  add column if not exists like_seed_count integer not null default 0;

create or replace function public.sync_community_post_counts()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_id uuid;
begin
  target_id := coalesce(new.post_id, old.post_id);
  update public.community_posts
  set likes_count = greatest(like_seed_count, (select count(*)::integer from public.community_post_likes where post_id = target_id)),
      comments_count = comment_seed_count + (select count(*)::integer from public.community_post_comments where post_id = target_id),
      updated_at = now()
  where id = target_id;
  return coalesce(new, old);
end; $$;

revoke all on function public.sync_community_post_counts() from public, anon, authenticated;

-- Publicações comunitárias do PULSO.
-- Permanecem separadas do catálogo oficial de oportunidades verificadas.

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 140),
  category text not null default 'other' check (category in ('employment','service','informal_work','sale','training','other')),
  type_label text not null check (char_length(btrim(type_label)) between 2 and 80),
  description text not null check (char_length(btrim(description)) between 10 and 3000),
  work_location text not null check (char_length(btrim(work_location)) between 2 and 160),
  neighborhood text not null check (char_length(btrim(neighborhood)) between 2 and 120),
  municipality text,
  province text not null check (char_length(btrim(province)) between 2 and 80),
  phone text not null check (phone ~ '^2449[0-9]{8}$'),
  whatsapp text not null check (whatsapp ~ '^2449[0-9]{8}$'),
  status text not null default 'active' check (status in ('active','hidden','deleted')),
  likes_count integer not null default 0 check (likes_count >= 0),
  comments_count integer not null default 0 check (comments_count >= 0),
  views_count integer not null default (200 + floor(random() * 801))::integer check (views_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_posts_feed_idx on public.community_posts (status, created_at desc);
create index if not exists community_posts_author_idx on public.community_posts (author_id, created_at desc);

create table if not exists public.community_post_likes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.community_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_comments_post_idx on public.community_post_comments (post_id, created_at asc);

alter table public.community_posts enable row level security;
alter table public.community_post_likes enable row level security;
alter table public.community_post_comments enable row level security;

drop policy if exists community_posts_public_select on public.community_posts;
create policy community_posts_public_select on public.community_posts for select to anon, authenticated using (status = 'active' or author_id = auth.uid());
drop policy if exists community_posts_own_insert on public.community_posts;
create policy community_posts_own_insert on public.community_posts for insert to authenticated with check (author_id = auth.uid());
drop policy if exists community_posts_own_update on public.community_posts;
create policy community_posts_own_update on public.community_posts for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists community_posts_own_delete on public.community_posts;
create policy community_posts_own_delete on public.community_posts for delete to authenticated using (author_id = auth.uid());

drop policy if exists community_likes_public_select on public.community_post_likes;
create policy community_likes_public_select on public.community_post_likes for select to anon, authenticated using (true);
drop policy if exists community_likes_own_insert on public.community_post_likes;
create policy community_likes_own_insert on public.community_post_likes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists community_likes_own_delete on public.community_post_likes;
create policy community_likes_own_delete on public.community_post_likes for delete to authenticated using (user_id = auth.uid());

drop policy if exists community_comments_public_select on public.community_post_comments;
create policy community_comments_public_select on public.community_post_comments for select to anon, authenticated using (true);
drop policy if exists community_comments_own_insert on public.community_post_comments;
create policy community_comments_own_insert on public.community_post_comments for insert to authenticated with check (author_id = auth.uid());
drop policy if exists community_comments_own_update on public.community_post_comments;
create policy community_comments_own_update on public.community_post_comments for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists community_comments_own_delete on public.community_post_comments;
create policy community_comments_own_delete on public.community_post_comments for delete to authenticated using (author_id = auth.uid());

grant select on public.community_posts, public.community_post_likes, public.community_post_comments to anon, authenticated;
grant insert, update, delete on public.community_posts to authenticated;
grant insert, delete on public.community_post_likes to authenticated;
grant insert, update, delete on public.community_post_comments to authenticated;

create or replace function public.community_posts_updated_at()
returns trigger language plpgsql security definer set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
revoke all on function public.community_posts_updated_at() from public, anon, authenticated;

drop trigger if exists community_posts_updated_at on public.community_posts;
create trigger community_posts_updated_at before update on public.community_posts for each row execute function public.community_posts_updated_at();

create or replace function public.sync_community_post_counts()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_id uuid;
begin
  target_id := coalesce(new.post_id, old.post_id);
  update public.community_posts
  set likes_count = (select count(*)::integer from public.community_post_likes where post_id = target_id),
      comments_count = (select count(*)::integer from public.community_post_comments where post_id = target_id),
      updated_at = now()
  where id = target_id;
  return coalesce(new, old);
end; $$;
revoke all on function public.sync_community_post_counts() from public, anon, authenticated;

drop trigger if exists community_likes_count on public.community_post_likes;
create trigger community_likes_count after insert or delete on public.community_post_likes for each row execute function public.sync_community_post_counts();
drop trigger if exists community_comments_count on public.community_post_comments;
create trigger community_comments_count after insert or delete on public.community_post_comments for each row execute function public.sync_community_post_counts();

create or replace function public.record_community_post_view(p_post_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare current_views integer;
begin
  update public.community_posts set views_count = least(views_count + 1, 2147483647)
  where id = p_post_id and status = 'active' returning views_count into current_views;
  return current_views;
end; $$;
grant execute on function public.record_community_post_view(uuid) to anon, authenticated;

create or replace function public.toggle_community_post_like(p_post_id uuid)
returns table (liked boolean, likes_count integer)
language plpgsql security definer set search_path = '' as $$
declare now_liked boolean;
begin
  if auth.uid() is null then raise exception 'É necessário iniciar sessão para gostar de uma publicação'; end if;
  if not exists (select 1 from public.community_posts where id = p_post_id and status = 'active') then raise exception 'Publicação indisponível'; end if;
  if exists (select 1 from public.community_post_likes where post_id = p_post_id and user_id = auth.uid()) then
    delete from public.community_post_likes where post_id = p_post_id and user_id = auth.uid(); now_liked := false;
  else
    insert into public.community_post_likes(post_id, user_id) values (p_post_id, auth.uid()); now_liked := true;
  end if;
  return query select now_liked, (select likes_count from public.community_posts where id = p_post_id);
end; $$;
grant execute on function public.toggle_community_post_like(uuid) to authenticated;

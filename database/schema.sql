create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    username text not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
    avatar_path text,
    created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists avatar_path text;

create unique index if not exists profiles_username_lower_unique
    on public.profiles (lower(username));

alter table public.profiles enable row level security;

grant select on public.profiles to anon, authenticated;
grant update (avatar_path) on public.profiles to authenticated;

drop policy if exists "Public profiles are viewable" on public.profiles;
create policy "Public profiles are viewable"
    on public.profiles
    for select
    to anon, authenticated
    using (true);

drop policy if exists "Members can update their own avatar path" on public.profiles;
create policy "Members can update their own avatar path"
    on public.profiles
    for update
    to authenticated
    using ((select auth.uid()) = id)
    with check ((select auth.uid()) = id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Avatar images are publicly readable" on storage.objects;
create policy "Avatar images are publicly readable"
    on storage.objects
    for select
    to public
    using (bucket_id = 'avatars');

drop policy if exists "Members can upload their own avatars" on storage.objects;
create policy "Members can upload their own avatars"
    on storage.objects
    for insert
    to authenticated
    with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists "Members can delete their own avatars" on storage.objects;
create policy "Members can delete their own avatars"
    on storage.objects
    for delete
    to authenticated
    using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
    insert into public.profiles (id, username)
    values (new.id, new.raw_user_meta_data ->> 'username');
    return new;
end;
$function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

create table if not exists public.posts (
    id uuid primary key default gen_random_uuid(),
    author_id uuid not null references public.profiles (id) on delete cascade,
    title text not null check (char_length(title) between 1 and 160),
    body text not null check (char_length(body) between 1 and 5000),
    created_at timestamptz not null default now()
);

create index if not exists posts_created_at_desc_idx
    on public.posts (created_at desc);

alter table public.posts enable row level security;

grant select on public.posts to anon, authenticated;
grant insert on public.posts to authenticated;

drop policy if exists "Posts are viewable by everyone" on public.posts;
create policy "Posts are viewable by everyone"
    on public.posts
    for select
    to anon, authenticated
    using (true);

drop policy if exists "Signed-in users can create posts as themselves" on public.posts;
create policy "Signed-in users can create posts as themselves"
    on public.posts
    for insert
    to authenticated
    with check ((select auth.uid()) = author_id);

create table if not exists public.replies (
    id uuid primary key default gen_random_uuid(),
    post_id uuid not null references public.posts (id) on delete cascade,
    author_id uuid not null references public.profiles (id) on delete cascade,
    body text not null check (char_length(body) between 1 and 2000),
    created_at timestamptz not null default now()
);

create index if not exists replies_post_created_at_idx
    on public.replies (post_id, created_at asc);

alter table public.replies enable row level security;

grant select on public.replies to anon, authenticated;
grant insert on public.replies to authenticated;

drop policy if exists "Replies are viewable by everyone" on public.replies;
create policy "Replies are viewable by everyone"
    on public.replies
    for select
    to anon, authenticated
    using (true);

drop policy if exists "Signed-in users can reply as themselves" on public.replies;
create policy "Signed-in users can reply as themselves"
    on public.replies
    for insert
    to authenticated
    with check ((select auth.uid()) = author_id);

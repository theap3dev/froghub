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

create table if not exists public.verified_users (
    user_id uuid primary key references public.profiles (id) on delete cascade,
    verified_at timestamptz not null default now()
);

alter table public.verified_users enable row level security;
grant select on public.verified_users to anon, authenticated;

drop policy if exists "Verified members are publicly viewable" on public.verified_users;
create policy "Verified members are publicly viewable"
    on public.verified_users
    for select
    to anon, authenticated
    using (true);

insert into public.verified_users (user_id)
select id
from public.profiles
where lower(username) in ('ap3', 'manington72', 'mrcube')
on conflict (user_id) do nothing;

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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Post images are publicly readable" on storage.objects;
create policy "Post images are publicly readable"
    on storage.objects
    for select
    to public
    using (bucket_id = 'post-images');

drop policy if exists "Members can upload their own post images" on storage.objects;
create policy "Members can upload their own post images"
    on storage.objects
    for insert
    to authenticated
    with check (
        bucket_id = 'post-images'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists "Members can delete their own post images" on storage.objects;
create policy "Members can delete their own post images"
    on storage.objects
    for delete
    to authenticated
    using (
        bucket_id = 'post-images'
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

alter table public.posts add column if not exists image_path text;

create index if not exists posts_created_at_desc_idx
    on public.posts (created_at desc);

alter table public.posts enable row level security;

grant select on public.posts to anon, authenticated;
grant insert on public.posts to authenticated;

create table if not exists public.post_tags (
    post_id uuid not null references public.posts (id) on delete cascade,
    tag text not null check (tag ~ '^[a-z0-9][a-z0-9-]{0,29}$'),
    primary key (post_id, tag)
);

create index if not exists post_tags_tag_post_idx
    on public.post_tags (tag, post_id);

alter table public.post_tags enable row level security;
grant select on public.post_tags to anon, authenticated;
grant insert on public.post_tags to authenticated;

drop policy if exists "Post tags are viewable by everyone" on public.post_tags;
create policy "Post tags are viewable by everyone"
    on public.post_tags
    for select
    to anon, authenticated
    using (true);

create table if not exists public.post_votes (
    post_id uuid not null references public.posts (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    vote smallint not null check (vote in (-1, 1)),
    created_at timestamptz not null default now(),
    primary key (post_id, user_id)
);

create index if not exists post_votes_user_post_idx
    on public.post_votes (user_id, post_id);

alter table public.post_votes enable row level security;
grant select, insert, update, delete on public.post_votes to authenticated;

create or replace view public.post_vote_totals as
select
    post_id,
    count(*) filter (where vote = 1)::integer as upvotes,
    count(*) filter (where vote = -1)::integer as downvotes
from public.post_votes
group by post_id;

grant select on public.post_vote_totals to anon, authenticated;

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

create table if not exists public.moderation_admins (
    user_id uuid primary key references auth.users (id) on delete cascade,
    created_at timestamptz not null default now()
);

alter table public.moderation_admins enable row level security;

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
    select exists (
        select 1
        from public.moderation_admins
        where user_id = (select auth.uid())
    );
$function$;

create table if not exists public.user_moderation (
    user_id uuid primary key references public.profiles (id) on delete cascade,
    is_banned boolean not null default false,
    timeout_until timestamptz,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (id) on delete set null
);

alter table public.user_moderation enable row level security;
grant select on public.user_moderation to authenticated;

drop policy if exists "Moderators can view user restrictions" on public.user_moderation;
create policy "Moderators can view user restrictions"
    on public.user_moderation
    for select
    to authenticated
    using (public.is_moderator());

create table if not exists public.moderation_warnings (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles (id) on delete cascade,
    moderator_id uuid references public.profiles (id) on delete set null,
    message text not null check (char_length(message) between 1 and 1000),
    created_at timestamptz not null default now()
);

create index if not exists moderation_warnings_created_at_idx
    on public.moderation_warnings (created_at desc);

alter table public.moderation_warnings enable row level security;
grant select on public.moderation_warnings to authenticated;

drop policy if exists "Moderators can view warnings" on public.moderation_warnings;
create policy "Moderators can view warnings"
    on public.moderation_warnings
    for select
    to authenticated
    using (public.is_moderator());

create or replace function public.is_current_user_restricted()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
    select exists (
        select 1
        from public.user_moderation
        where user_id = (select auth.uid())
            and (is_banned or timeout_until > now())
    );
$function$;

revoke execute on function public.is_moderator() from public;
revoke execute on function public.is_current_user_restricted() from public;
grant execute on function public.is_moderator() to authenticated;
grant execute on function public.is_current_user_restricted() to authenticated;

drop policy if exists "Members can read their own post votes" on public.post_votes;
create policy "Members can read their own post votes"
    on public.post_votes
    for select
    to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Members can vote on posts" on public.post_votes;
create policy "Members can vote on posts"
    on public.post_votes
    for insert
    to authenticated
    with check (
        (select auth.uid()) = user_id
        and not public.is_current_user_restricted()
    );

drop policy if exists "Members can change their own post votes" on public.post_votes;
create policy "Members can change their own post votes"
    on public.post_votes
    for update
    to authenticated
    using (
        (select auth.uid()) = user_id
        and not public.is_current_user_restricted()
    )
    with check (
        (select auth.uid()) = user_id
        and not public.is_current_user_restricted()
    );

drop policy if exists "Members can remove their own post votes" on public.post_votes;
create policy "Members can remove their own post votes"
    on public.post_votes
    for delete
    to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Members can upload their own post images" on storage.objects;
create policy "Members can upload their own post images"
    on storage.objects
    for insert
    to authenticated
    with check (
        bucket_id = 'post-images'
        and (storage.foldername(name))[1] = (select auth.uid())::text
        and not public.is_current_user_restricted()
    );

drop policy if exists "Members can tag their own posts" on public.post_tags;
create policy "Members can tag their own posts"
    on public.post_tags
    for insert
    to authenticated
    with check (
        exists (
            select 1
            from public.posts as tagged_post
            where tagged_post.id = post_tags.post_id
                and tagged_post.author_id = (select auth.uid())
        )
        and not public.is_current_user_restricted()
    );

create or replace function public.admin_set_user_restriction(
    p_user_id uuid,
    p_restriction text,
    p_timeout_until timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
    if not public.is_moderator() then
        raise exception 'Moderator access required';
    end if;
    if p_restriction not in ('ban', 'timeout', 'clear') then
        raise exception 'Invalid restriction';
    end if;
    if p_restriction = 'timeout' and (p_timeout_until is null or p_timeout_until <= now()) then
        raise exception 'Timeout must end in the future';
    end if;

    insert into public.user_moderation (user_id, is_banned, timeout_until, updated_at, updated_by)
    values (
        p_user_id,
        p_restriction = 'ban',
        case when p_restriction = 'timeout' then p_timeout_until else null end,
        now(),
        (select auth.uid())
    )
    on conflict (user_id) do update
    set is_banned = excluded.is_banned,
        timeout_until = excluded.timeout_until,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
end;
$function$;

create or replace function public.admin_warn_user(p_user_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
    if not public.is_moderator() then
        raise exception 'Moderator access required';
    end if;
    if char_length(trim(p_message)) not between 1 and 1000 then
        raise exception 'Warning must be between 1 and 1000 characters';
    end if;

    insert into public.moderation_warnings (user_id, moderator_id, message)
    values (p_user_id, (select auth.uid()), trim(p_message));
end;
$function$;

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
    if not public.is_moderator() then
        raise exception 'Moderator access required';
    end if;
    if p_user_id is null or p_user_id = (select auth.uid()) then
        raise exception 'You cannot delete your own account from the moderation panel';
    end if;
    if exists (select 1 from public.moderation_admins where user_id = p_user_id)
        and (select count(*) from public.moderation_admins) <= 1 then
        raise exception 'Cannot delete the last moderator account';
    end if;

    delete from auth.users where id = p_user_id;
    if not found then
        raise exception 'Account not found';
    end if;
end;
$function$;

revoke execute on function public.admin_set_user_restriction(uuid, text, timestamptz) from public;
revoke execute on function public.admin_warn_user(uuid, text) from public;
revoke execute on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_set_user_restriction(uuid, text, timestamptz) to authenticated;
grant execute on function public.admin_warn_user(uuid, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;

drop policy if exists "Signed-in users can create posts as themselves" on public.posts;
create policy "Signed-in users can create posts as themselves"
    on public.posts
    for insert
    to authenticated
    with check (
        (select auth.uid()) = author_id
        and not public.is_current_user_restricted()
    );

grant delete on public.posts to authenticated;

drop policy if exists "Moderators can delete posts" on public.posts;
create policy "Moderators can delete posts"
    on public.posts
    for delete
    to authenticated
    using (public.is_moderator());

drop policy if exists "Signed-in users can reply as themselves" on public.replies;
create policy "Signed-in users can reply as themselves"
    on public.replies
    for insert
    to authenticated
    with check (
        (select auth.uid()) = author_id
        and not public.is_current_user_restricted()
    );

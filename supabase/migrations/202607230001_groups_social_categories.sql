-- 故事情感地图：群组、基础社交、地点分类与信息流
-- 增量 migration；不修改既有 migration，不猜测或改写旧记录的时间语义。

create table public.place_categories (
  slug text primary key,
  label text not null,
  icon_key text not null,
  sort_order integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint place_categories_slug_format check (slug ~ '^[a-z][a-z0-9-]{1,31}$'),
  constraint place_categories_label_length check (char_length(btrim(label)) between 1 and 40),
  constraint place_categories_icon_key_format check (icon_key ~ '^[a-z][a-z0-9-]{1,31}$'),
  constraint place_categories_sort_order_nonnegative check (sort_order >= 0)
);

insert into public.place_categories (slug, label, icon_key, sort_order) values
  ('home', '家与住所', 'home', 10),
  ('school', '学校与教育', 'school', 20),
  ('work', '工作场所', 'work', 30),
  ('food', '餐饮', 'food', 40),
  ('transport', '交通地点', 'transport', 50),
  ('street', '城市街道', 'street', 60),
  ('nature', '公园与自然', 'nature', 70),
  ('landmark', '文化与地标', 'landmark', 80),
  ('medical', '医疗', 'medical', 90),
  ('travel', '旅行住宿', 'travel', 100),
  ('memorial', '纪念地点', 'memorial', 110),
  ('other', '其他', 'other', 120);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name varchar(80) not null,
  description text not null default '',
  avatar_url text,
  visibility text not null default 'private',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint groups_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 3 and 48),
  constraint groups_name_not_blank check (char_length(btrim(name)) between 1 and 80),
  constraint groups_description_length check (char_length(description) <= 2000),
  constraint groups_avatar_url_length check (avatar_url is null or char_length(avatar_url) <= 2048),
  constraint groups_visibility_values check (visibility in ('public', 'private')),
  constraint groups_archive_consistency check (
    (archived_at is null and archived_by is null)
    or (archived_at is not null and archived_by is not null)
  )
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'active',
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id),
  constraint group_members_role_values check (role in ('owner', 'admin', 'member')),
  constraint group_members_status_values check (status in ('active', 'left', 'removed')),
  constraint group_members_joined_consistency check (
    (status = 'active' and joined_at is not null)
    or status <> 'active'
  )
);

create unique index group_members_one_active_owner_idx
on public.group_members(group_id)
where role = 'owner' and status = 'active';

create table public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  constraint group_invitations_status_values check (status in ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  constraint group_invitations_not_self check (inviter_id <> invitee_id),
  constraint group_invitations_response_consistency check (
    (status = 'pending' and responded_at is null)
    or (status <> 'pending' and responded_at is not null)
  )
);

create unique index group_invitations_one_pending_idx
on public.group_invitations(group_id, invitee_id)
where status = 'pending';

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_not_self check (follower_id <> following_id)
);

create table public.entry_likes (
  entry_id uuid not null references public.map_entries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, user_id)
);

create table public.entry_comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.map_entries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content varchar(1000) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  moderated_at timestamptz,
  moderated_by uuid references public.profiles(id) on delete set null,
  constraint entry_comments_content_valid check (
    deleted_at is not null or char_length(btrim(content)) between 1 and 1000
  ),
  constraint entry_comments_moderation_consistency check (
    (moderated_at is null and moderated_by is null)
    or (moderated_at is not null and moderated_by is not null)
  )
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  reason text not null,
  description text not null default '',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_notes text,
  constraint reports_target_type_values check (target_type in ('entry', 'comment', 'user', 'group')),
  constraint reports_reason_values check (reason in ('spam', 'harassment', 'hate', 'privacy', 'misinformation', 'other')),
  constraint reports_description_length check (char_length(description) <= 1000),
  constraint reports_status_values check (status in ('pending', 'reviewing', 'resolved', 'dismissed'))
);

alter table public.map_entries
  add column group_id uuid references public.groups(id) on delete restrict,
  add column place_category_slug text references public.place_categories(slug) on update cascade default 'other',
  add column allow_comments boolean not null default true;

update public.map_entries
set place_category_slug = 'other'
where place_category_slug is null;

alter table public.map_entries
  alter column place_category_slug set not null;

alter table public.map_entries
  drop constraint if exists map_entries_visibility_values;

alter table public.map_entries
  add constraint map_entries_visibility_values
  check (visibility in ('public', 'private', 'group'));

alter table public.map_entries
  add constraint map_entries_group_visibility_consistency
  check (
    (visibility = 'group' and group_id is not null)
    or (visibility <> 'group' and group_id is null)
  );

create index group_members_group_status_idx on public.group_members(group_id, status);
create index group_members_user_status_idx on public.group_members(user_id, status);
create index group_invitations_invitee_status_idx on public.group_invitations(invitee_id, status);
create index group_invitations_group_status_idx on public.group_invitations(group_id, status);
create index groups_visibility_created_at_idx on public.groups(visibility, created_at desc);
create index groups_created_by_idx on public.groups(created_by);
create index map_entries_group_created_at_idx on public.map_entries(group_id, created_at desc);
create index map_entries_place_category_idx on public.map_entries(place_category_slug);
create index follows_follower_created_at_idx on public.follows(follower_id, created_at desc);
create index follows_following_created_at_idx on public.follows(following_id, created_at desc);
create index entry_likes_entry_idx on public.entry_likes(entry_id);
create index entry_comments_entry_created_at_idx on public.entry_comments(entry_id, created_at desc);
create index reports_reporter_created_at_idx on public.reports(reporter_id, created_at desc);
create index reports_target_idx on public.reports(target_type, target_id);

create trigger groups_set_updated_at
before update on public.groups
for each row execute function public.set_updated_at();

create trigger group_members_set_updated_at
before update on public.group_members
for each row execute function public.set_updated_at();

create trigger entry_comments_set_updated_at
before update on public.entry_comments
for each row execute function public.set_updated_at();

create or replace function public.is_active_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = p_group_id
      and user_id = (select auth.uid())
      and status = 'active'
  );
$$;

create or replace function public.is_group_admin(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = p_group_id
      and user_id = (select auth.uid())
      and status = 'active'
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.is_group_owner(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = p_group_id
      and user_id = (select auth.uid())
      and status = 'active'
      and role = 'owner'
  );
$$;

create or replace function public.can_view_group(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and (
        g.visibility = 'public'
        or exists (
          select 1 from public.group_members gm
          where gm.group_id = g.id
            and gm.user_id = (select auth.uid())
            and gm.status = 'active'
        )
        or exists (
          select 1 from public.group_invitations gi
          where gi.group_id = g.id
            and gi.invitee_id = (select auth.uid())
            and gi.status = 'pending'
            and gi.expires_at > now()
        )
      )
  );
$$;

create or replace function public.can_read_entry(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.map_entries e
    where e.id = p_entry_id
      and (
        e.visibility = 'public'
        or (e.visibility = 'private' and e.user_id = (select auth.uid()))
        or (
          e.visibility = 'group'
          and exists (
            select 1 from public.group_members gm
            where gm.group_id = e.group_id
              and gm.user_id = (select auth.uid())
              and gm.status = 'active'
          )
        )
      )
  );
$$;

create or replace function public.can_interact_entry(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.map_entries e
    where e.id = p_entry_id
      and (
        e.visibility = 'public'
        or (
          e.visibility = 'group'
          and exists (
            select 1 from public.group_members gm
            where gm.group_id = e.group_id
              and gm.user_id = (select auth.uid())
              and gm.status = 'active'
          )
        )
      )
  );
$$;

create or replace function public.can_report_target(p_target_type text, p_target_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then return false; end if;
  if p_target_type = 'entry' then
    return exists (
      select 1 from public.map_entries
      where id = p_target_id
        and visibility in ('public', 'group')
        and public.can_read_entry(id)
    );
  elsif p_target_type = 'comment' then
    return exists (
      select 1 from public.entry_comments c
      where c.id = p_target_id and public.can_read_entry(c.entry_id)
    );
  elsif p_target_type = 'user' then
    return exists (select 1 from public.profiles where id = p_target_id);
  elsif p_target_type = 'group' then
    return public.can_view_group(p_target_id);
  end if;
  return false;
end;
$$;

revoke all on function public.is_active_group_member(uuid) from public;
revoke all on function public.is_group_admin(uuid) from public;
revoke all on function public.is_group_owner(uuid) from public;
revoke all on function public.can_view_group(uuid) from public;
revoke all on function public.can_read_entry(uuid) from public;
revoke all on function public.can_interact_entry(uuid) from public;
revoke all on function public.can_report_target(text, uuid) from public;
grant execute on function public.is_active_group_member(uuid) to anon, authenticated;
grant execute on function public.is_group_admin(uuid) to authenticated;
grant execute on function public.is_group_owner(uuid) to authenticated;
grant execute on function public.can_view_group(uuid) to anon, authenticated;
grant execute on function public.can_read_entry(uuid) to anon, authenticated;
grant execute on function public.can_interact_entry(uuid) to authenticated;
grant execute on function public.can_report_target(text, uuid) to authenticated;

create or replace function public.add_group_owner_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.group_members (group_id, user_id, role, status, joined_at)
  values (new.id, new.created_by, 'owner', 'active', now());
  return new;
end;
$$;

create trigger groups_add_owner
after insert on public.groups
for each row execute function public.add_group_owner_after_insert();

create or replace function public.protect_group_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.updated_at is distinct from old.updated_at then
    raise exception using errcode = '42501', message = 'database-maintained group fields are immutable';
  end if;
  if not public.is_group_owner(old.id)
    and (
      new.slug is distinct from old.slug
      or new.visibility is distinct from old.visibility
    ) then
    raise exception using errcode = '42501', message = 'only the owner can change group identity or visibility';
  end if;
  if old.archived_at is not null then
    raise exception using errcode = '55000', message = 'archived groups are read-only';
  end if;
  if new.archived_at is distinct from old.archived_at then
    if not public.is_group_owner(old.id) then
      raise exception using errcode = '42501', message = 'only the owner can archive a group';
    end if;
    if new.archived_at is null then
      raise exception using errcode = '55000', message = 'groups cannot be unarchived by clients';
    end if;
    new.archived_by := (select auth.uid());
  elsif new.archived_by is distinct from old.archived_by then
    raise exception using errcode = '42501', message = 'archived_by is database-maintained';
  end if;
  return new;
end;
$$;

create trigger groups_protect_fields
before update on public.groups
for each row execute function public.protect_group_fields();

create or replace function public.validate_group_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.visibility = 'group' then
    if new.group_id is null then
      raise exception using errcode = '23514', message = 'group visibility requires group_id';
    end if;
    if not exists (
      select 1 from public.groups
      where id = new.group_id and archived_at is null
    ) then
      raise exception using errcode = '55000', message = 'group is unavailable or archived';
    end if;
    if not public.is_active_group_member(new.group_id) then
      raise exception using errcode = '42501', message = 'active group membership required';
    end if;
  elsif new.group_id is not null then
    raise exception using errcode = '23514', message = 'non-group entries cannot have group_id';
  end if;
  return new;
end;
$$;

create trigger map_entries_validate_group
before insert or update of visibility, group_id on public.map_entries
for each row execute function public.validate_group_entry();

create or replace function public.join_public_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if not exists (
    select 1 from public.groups
    where id = p_group_id and visibility = 'public' and archived_at is null
  ) then
    raise exception using errcode = '42501', message = 'public active group required';
  end if;
  insert into public.group_members (group_id, user_id, role, status, joined_at)
  values (p_group_id, (select auth.uid()), 'member', 'active', now())
  on conflict (group_id, user_id) do update
    set role = 'member', status = 'active', joined_at = now(), updated_at = now();
end;
$$;

create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare current_role text;
begin
  select role into current_role
  from public.group_members
  where group_id = p_group_id
    and user_id = (select auth.uid())
    and status = 'active';
  if current_role is null then
    raise exception using errcode = 'P0002', message = 'active membership not found';
  end if;
  if current_role = 'owner' then
    raise exception using errcode = '42501', message = 'owner must transfer ownership before leaving';
  end if;
  update public.group_members
  set status = 'left', updated_at = now()
  where group_id = p_group_id and user_id = (select auth.uid());
end;
$$;

create or replace function public.invite_group_member(p_group_id uuid, p_invitee_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare invitation_id uuid;
begin
  if not public.is_group_admin(p_group_id) then
    raise exception using errcode = '42501', message = 'group administrator required';
  end if;
  if not exists (select 1 from public.groups where id = p_group_id and archived_at is null) then
    raise exception using errcode = '55000', message = 'group is archived';
  end if;
  if p_invitee_id = (select auth.uid()) then
    raise exception using errcode = '23514', message = 'cannot invite yourself';
  end if;
  if not exists (select 1 from public.profiles where id = p_invitee_id) then
    raise exception using errcode = 'P0002', message = 'invitee not found';
  end if;
  if exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_invitee_id and status = 'active'
  ) then
    raise exception using errcode = '23505', message = 'user is already a member';
  end if;
  update public.group_invitations
  set status = 'cancelled', responded_at = now()
  where group_id = p_group_id and invitee_id = p_invitee_id and status = 'pending';
  insert into public.group_invitations (group_id, inviter_id, invitee_id)
  values (p_group_id, (select auth.uid()), p_invitee_id)
  returning id into invitation_id;
  return invitation_id;
end;
$$;

create or replace function public.respond_group_invitation(p_invitation_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare invitation public.group_invitations;
begin
  select * into invitation
  from public.group_invitations
  where id = p_invitation_id and invitee_id = (select auth.uid())
  for update;
  if invitation.id is null then
    raise exception using errcode = 'P0002', message = 'invitation not found';
  end if;
  if invitation.status <> 'pending' then
    raise exception using errcode = '55000', message = 'invitation already handled';
  end if;
  if invitation.expires_at <= now() then
    update public.group_invitations
    set status = 'expired', responded_at = now()
    where id = invitation.id;
    raise exception using errcode = '55000', message = 'invitation expired';
  end if;
  if p_accept then
    if exists (select 1 from public.groups where id = invitation.group_id and archived_at is not null) then
      raise exception using errcode = '55000', message = 'group is archived';
    end if;
    insert into public.group_members (group_id, user_id, role, status, joined_at)
    values (invitation.group_id, invitation.invitee_id, 'member', 'active', now())
    on conflict (group_id, user_id) do update
      set role = 'member', status = 'active', joined_at = now(), updated_at = now();
    update public.group_invitations
    set status = 'accepted', responded_at = now()
    where id = invitation.id;
  else
    update public.group_invitations
    set status = 'declined', responded_at = now()
    where id = invitation.id;
  end if;
end;
$$;

create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_role text;
declare target_role text;
begin
  select role into actor_role from public.group_members
  where group_id = p_group_id and user_id = (select auth.uid()) and status = 'active';
  select role into target_role from public.group_members
  where group_id = p_group_id and user_id = p_user_id and status = 'active';
  if actor_role not in ('owner', 'admin') or target_role is null then
    raise exception using errcode = '42501', message = 'insufficient group permission';
  end if;
  if exists (select 1 from public.groups where id = p_group_id and archived_at is not null) then
    raise exception using errcode = '55000', message = 'group is archived';
  end if;
  if target_role = 'owner' or (actor_role = 'admin' and target_role <> 'member') then
    raise exception using errcode = '42501', message = 'cannot remove this member';
  end if;
  update public.group_members
  set status = 'removed', updated_at = now()
  where group_id = p_group_id and user_id = p_user_id;
end;
$$;

create or replace function public.change_group_member_role(
  p_group_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.groups where id = p_group_id for update;
  if not public.is_group_owner(p_group_id) then
    raise exception using errcode = '42501', message = 'group owner required';
  end if;
  if exists (select 1 from public.groups where id = p_group_id and archived_at is not null) then
    raise exception using errcode = '55000', message = 'group is archived';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception using errcode = '23514', message = 'invalid role';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception using errcode = '42501', message = 'owner role requires transfer';
  end if;
  update public.group_members
  set role = p_role, updated_at = now()
  where group_id = p_group_id and user_id = p_user_id and status = 'active';
  if not found then
    raise exception using errcode = 'P0002', message = 'active member not found';
  end if;
end;
$$;

create or replace function public.transfer_group_ownership(p_group_id uuid, p_new_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.groups where id = p_group_id for update;
  if not public.is_group_owner(p_group_id) then
    raise exception using errcode = '42501', message = 'group owner required';
  end if;
  if exists (select 1 from public.groups where id = p_group_id and archived_at is not null) then
    raise exception using errcode = '55000', message = 'group is archived';
  end if;
  if p_new_owner_id = (select auth.uid()) then return; end if;
  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_new_owner_id and status = 'active'
  ) then
    raise exception using errcode = 'P0002', message = 'new owner must be an active member';
  end if;
  update public.group_members
  set role = 'admin', updated_at = now()
  where group_id = p_group_id and user_id = (select auth.uid()) and role = 'owner';
  update public.group_members
  set role = 'owner', updated_at = now()
  where group_id = p_group_id and user_id = p_new_owner_id;
end;
$$;

create or replace function public.soft_delete_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.entry_comments
  set content = '', deleted_at = now(), updated_at = now()
  where id = p_comment_id
    and user_id = (select auth.uid())
    and deleted_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'comment not found or not owned';
  end if;
end;
$$;

create or replace function public.moderate_group_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target_group_id uuid;
begin
  select e.group_id into target_group_id
  from public.entry_comments c
  join public.map_entries e on e.id = c.entry_id
  where c.id = p_comment_id and e.visibility = 'group';
  if target_group_id is null or not public.is_group_admin(target_group_id) then
    raise exception using errcode = '42501', message = 'group administrator required';
  end if;
  update public.entry_comments
  set content = '', deleted_at = coalesce(deleted_at, now()),
      moderated_at = now(), moderated_by = (select auth.uid()), updated_at = now()
  where id = p_comment_id;
end;
$$;

create or replace function public.prevent_report_spam()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.reports
    where reporter_id = new.reporter_id
      and target_type = new.target_type
      and target_id = new.target_id
      and created_at > now() - interval '1 hour'
  ) then
    raise exception using errcode = '23505', message = 'duplicate report in cooldown';
  end if;
  return new;
end;
$$;

create trigger reports_prevent_spam
before insert on public.reports
for each row execute function public.prevent_report_spam();

create or replace function public.get_social_feed(
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  user_id uuid,
  title text,
  content text,
  place_name text,
  latitude double precision,
  longitude double precision,
  time_label text,
  visibility text,
  group_id uuid,
  place_category_slug text,
  allow_comments boolean,
  created_at timestamptz,
  updated_at timestamptz,
  author_display_name text,
  author_avatar_url text,
  group_name text,
  group_slug text,
  like_count bigint,
  comment_count bigint,
  user_liked boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.id, e.user_id, e.title::text, e.content, e.place_name,
    e.latitude, e.longitude, e.time_label, e.visibility, e.group_id,
    e.place_category_slug, e.allow_comments, e.created_at, e.updated_at,
    p.display_name, p.avatar_url, g.name::text, g.slug,
    (select count(*) from public.entry_likes l where l.entry_id = e.id),
    (select count(*) from public.entry_comments c where c.entry_id = e.id and c.deleted_at is null),
    exists (
      select 1 from public.entry_likes mine
      where mine.entry_id = e.id and mine.user_id = (select auth.uid())
    )
  from public.map_entries e
  join public.profiles p on p.id = e.user_id
  left join public.groups g on g.id = e.group_id
  where (select auth.uid()) is not null
    and (
      (
        e.user_id = (select auth.uid())
        and e.visibility in ('public', 'private')
      )
      or (
        e.visibility = 'public'
        and exists (
          select 1 from public.follows f
          where f.follower_id = (select auth.uid()) and f.following_id = e.user_id
        )
      )
      or (
        e.visibility = 'group'
        and exists (
          select 1 from public.group_members gm
          where gm.group_id = e.group_id
            and gm.user_id = (select auth.uid())
            and gm.status = 'active'
        )
      )
    )
    and (
      p_cursor_created_at is null
      or (e.created_at, e.id) < (p_cursor_created_at, p_cursor_id)
    )
  order by e.created_at desc, e.id desc
  limit least(greatest(p_limit, 1), 50);
$$;

revoke all on function public.join_public_group(uuid) from public;
revoke all on function public.leave_group(uuid) from public;
revoke all on function public.invite_group_member(uuid, uuid) from public;
revoke all on function public.respond_group_invitation(uuid, boolean) from public;
revoke all on function public.remove_group_member(uuid, uuid) from public;
revoke all on function public.change_group_member_role(uuid, uuid, text) from public;
revoke all on function public.transfer_group_ownership(uuid, uuid) from public;
revoke all on function public.soft_delete_comment(uuid) from public;
revoke all on function public.moderate_group_comment(uuid) from public;
revoke all on function public.get_social_feed(timestamptz, uuid, integer) from public;
grant execute on function public.join_public_group(uuid) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.invite_group_member(uuid, uuid) to authenticated;
grant execute on function public.respond_group_invitation(uuid, boolean) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.change_group_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.transfer_group_ownership(uuid, uuid) to authenticated;
grant execute on function public.soft_delete_comment(uuid) to authenticated;
grant execute on function public.moderate_group_comment(uuid) to authenticated;
grant execute on function public.get_social_feed(timestamptz, uuid, integer) to authenticated;

alter table public.place_categories enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invitations enable row level security;
alter table public.follows enable row level security;
alter table public.entry_likes enable row level security;
alter table public.entry_comments enable row level security;
alter table public.reports enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'group_members'
  ) then
    alter publication supabase_realtime add table public.group_members;
  end if;
end;
$$;

create policy "categories_public_read"
on public.place_categories for select to anon, authenticated
using (is_active);

create policy "groups_visible_to_public_members_or_invitees"
on public.groups for select to anon, authenticated
using (public.can_view_group(id));

create policy "authenticated_users_create_groups"
on public.groups for insert to authenticated
with check (created_by = (select auth.uid()) and archived_at is null and archived_by is null);

create policy "group_admins_update_groups"
on public.groups for update to authenticated
using (public.is_group_admin(id))
with check (public.is_group_admin(id));

create policy "group_members_visible_when_group_visible"
on public.group_members for select to anon, authenticated
using (
  public.is_active_group_member(group_id)
  or exists (
    select 1 from public.groups g
    where g.id = group_id and g.visibility = 'public'
  )
);

create policy "invitations_visible_to_invitee_or_admin"
on public.group_invitations for select to authenticated
using (
  invitee_id = (select auth.uid())
  or public.is_group_admin(group_id)
);

create policy "follows_are_public"
on public.follows for select to anon, authenticated
using (true);

create policy "users_create_own_follows"
on public.follows for insert to authenticated
with check (follower_id = (select auth.uid()) and follower_id <> following_id);

create policy "users_delete_own_follows"
on public.follows for delete to authenticated
using (follower_id = (select auth.uid()));

drop policy if exists "entries_public_or_owned_select" on public.map_entries;
drop policy if exists "entries_owner_insert" on public.map_entries;
drop policy if exists "entries_owner_update" on public.map_entries;

create policy "entries_visible_by_visibility_model"
on public.map_entries for select to anon, authenticated
using (
  visibility = 'public'
  or (visibility = 'private' and user_id = (select auth.uid()))
  or (visibility = 'group' and public.is_active_group_member(group_id))
);

create policy "entries_owner_insert_with_group_membership"
on public.map_entries for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (
    visibility <> 'group'
    or public.is_active_group_member(group_id)
  )
);

create policy "entries_owner_update_with_group_membership"
on public.map_entries for update to authenticated
using (
  user_id = (select auth.uid())
  and (
    visibility <> 'group'
    or public.is_active_group_member(group_id)
  )
)
with check (
  user_id = (select auth.uid())
  and (
    visibility <> 'group'
    or public.is_active_group_member(group_id)
  )
);

create policy "likes_visible_with_entry"
on public.entry_likes for select to anon, authenticated
using (public.can_read_entry(entry_id));

create policy "users_like_interactable_entries"
on public.entry_likes for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.can_interact_entry(entry_id)
);

create policy "users_remove_own_likes"
on public.entry_likes for delete to authenticated
using (user_id = (select auth.uid()) and public.can_read_entry(entry_id));

create policy "comments_visible_with_entry"
on public.entry_comments for select to anon, authenticated
using (public.can_read_entry(entry_id));

create policy "users_comment_on_interactable_entries"
on public.entry_comments for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.can_interact_entry(entry_id)
  and exists (
    select 1 from public.map_entries e
    where e.id = entry_id and e.allow_comments
  )
);

create policy "users_edit_own_live_comments"
on public.entry_comments for update to authenticated
using (user_id = (select auth.uid()) and deleted_at is null)
with check (user_id = (select auth.uid()) and deleted_at is null);

create policy "reporters_read_only_their_reports"
on public.reports for select to authenticated
using (reporter_id = (select auth.uid()));

create policy "users_create_valid_reports"
on public.reports for insert to authenticated
with check (
  reporter_id = (select auth.uid())
  and public.can_report_target(target_type, target_id)
  and status = 'pending'
  and reviewed_at is null
  and reviewed_by is null
);

grant select on public.place_categories to anon, authenticated;
grant select on public.groups to anon, authenticated;
grant insert (
  slug, name, description, avatar_url, visibility, created_by
) on public.groups to authenticated;
grant update (
  slug, name, description, avatar_url, visibility, archived_at
) on public.groups to authenticated;
grant select on public.group_members to anon, authenticated;
grant select on public.group_invitations to authenticated;
grant select on public.follows to anon, authenticated;
grant insert (follower_id, following_id) on public.follows to authenticated;
grant delete on public.follows to authenticated;
grant select on public.entry_likes to anon, authenticated;
grant insert (entry_id, user_id) on public.entry_likes to authenticated;
grant delete on public.entry_likes to authenticated;
grant select on public.entry_comments to anon, authenticated;
grant insert (entry_id, user_id, content) on public.entry_comments to authenticated;
grant update (content) on public.entry_comments to authenticated;
grant select on public.reports to authenticated;
grant insert (
  reporter_id, target_type, target_id, reason, description
) on public.reports to authenticated;

revoke update on public.map_entries from authenticated;
grant update (
  title, content, place_name, latitude, longitude,
  occurred_local, occurred_timezone, occurred_date, occurred_year,
  time_precision, time_label, visibility, group_id,
  place_category_slug, allow_comments
) on public.map_entries to authenticated;

revoke insert on public.map_entries from authenticated;
grant insert (
  user_id, title, content, place_name, latitude, longitude,
  occurred_local, occurred_timezone, occurred_date, occurred_year,
  time_precision, time_label, visibility, group_id,
  place_category_slug, allow_comments
) on public.map_entries to authenticated;

comment on table public.groups is 'Public/private narrative groups. Archived groups are retained read-only.';
comment on table public.group_members is 'Membership mutations are allowed only through restricted RPC functions.';
comment on table public.reports is 'User-submitted moderation queue; ordinary users can read only their own reports.';

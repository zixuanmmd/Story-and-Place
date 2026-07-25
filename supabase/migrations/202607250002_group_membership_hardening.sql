-- Harden group ownership invariants and RPC execution privileges.
-- This migration is additive and intentionally leaves existing groups and stories intact.

-- Repair any previously orphaned group by restoring its original creator as owner.
-- This is deterministic, preserves all other memberships, and avoids deleting data.
insert into public.group_members (
  group_id,
  user_id,
  role,
  status,
  joined_at
)
select
  target.id,
  target.created_by,
  'owner',
  'active',
  target.created_at
from public.groups as target
where not exists (
  select 1
  from public.group_members as membership
  where membership.group_id = target.id
    and membership.role = 'owner'
    and membership.status = 'active'
)
on conflict (group_id, user_id) do update
set
  role = 'owner',
  status = 'active',
  joined_at = coalesce(public.group_members.joined_at, excluded.joined_at),
  updated_at = now();

create or replace function public.ensure_group_has_active_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_group_id uuid;
begin
  target_group_id := case when tg_op = 'DELETE' then old.group_id else new.group_id end;

  if exists (
    select 1
    from public.groups
    where id = target_group_id
  ) and not exists (
    select 1
    from public.group_members
    where group_id = target_group_id
      and role = 'owner'
      and status = 'active'
  ) then
    raise exception using
      errcode = '23514',
      message = 'group must retain at least one active owner';
  end if;

  return null;
end;
$$;

revoke all on function public.ensure_group_has_active_owner() from public, anon, authenticated;

drop trigger if exists group_members_require_active_owner on public.group_members;
create constraint trigger group_members_require_active_owner
after insert or update or delete on public.group_members
deferrable initially deferred
for each row execute function public.ensure_group_has_active_owner();

create or replace function public.join_public_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_role text;
  existing_status text;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if not exists (
    select 1
    from public.groups
    where id = p_group_id
      and visibility = 'public'
      and archived_at is null
  ) then
    raise exception using errcode = '42501', message = 'public active group required';
  end if;

  select role, status
  into existing_role, existing_status
  from public.group_members
  where group_id = p_group_id
    and user_id = (select auth.uid())
  for update;

  if found then
    -- Repeated joins are idempotent and must never demote an owner or admin.
    if existing_status = 'active' then
      return;
    end if;

    -- Removal by a moderator remains effective until an administrator invites
    -- the user again. A voluntary leave may be reversed by joining again.
    if existing_status = 'removed' then
      raise exception using
        errcode = '42501',
        message = 'removed membership requires a new invitation';
    end if;

    update public.group_members
    set
      role = case when existing_role = 'owner' then 'owner' else 'member' end,
      status = 'active',
      joined_at = now(),
      updated_at = now()
    where group_id = p_group_id
      and user_id = (select auth.uid());
    return;
  end if;

  insert into public.group_members (
    group_id,
    user_id,
    role,
    status,
    joined_at
  )
  values (
    p_group_id,
    (select auth.uid()),
    'member',
    'active',
    now()
  );
end;
$$;

-- Explicitly remove anonymous execution from authentication-only helpers and
-- mutation RPCs. The additional anon revoke also repairs remote ACL drift.
revoke execute on function public.is_group_admin(uuid) from public, anon;
revoke execute on function public.is_group_owner(uuid) from public, anon;
revoke execute on function public.can_interact_entry(uuid) from public, anon;
revoke execute on function public.can_report_target(text, uuid) from public, anon;
revoke execute on function public.join_public_group(uuid) from public, anon;
revoke execute on function public.leave_group(uuid) from public, anon;
revoke execute on function public.invite_group_member(uuid, uuid) from public, anon;
revoke execute on function public.respond_group_invitation(uuid, boolean) from public, anon;
revoke execute on function public.remove_group_member(uuid, uuid) from public, anon;
revoke execute on function public.change_group_member_role(uuid, uuid, text) from public, anon;
revoke execute on function public.transfer_group_ownership(uuid, uuid) from public, anon;
revoke execute on function public.soft_delete_comment(uuid) from public, anon;
revoke execute on function public.moderate_group_comment(uuid) from public, anon;
revoke execute on function public.get_social_feed(timestamptz, uuid, integer) from public, anon;

grant execute on function public.is_group_admin(uuid) to authenticated;
grant execute on function public.is_group_owner(uuid) to authenticated;
grant execute on function public.can_interact_entry(uuid) to authenticated;
grant execute on function public.can_report_target(text, uuid) to authenticated;
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

comment on function public.ensure_group_has_active_owner() is
  'Deferred ownership invariant: every retained group must have an active owner.';

notify pgrst, 'reload schema';

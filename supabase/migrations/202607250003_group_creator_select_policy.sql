-- Allow an authenticated group creator to read the row they just inserted.
--
-- The existing groups SELECT policy delegates to can_view_group(id). That
-- stable helper queries public.groups again and cannot reliably observe the
-- new row during INSERT ... RETURNING. PostgREST uses RETURNING when the
-- client chains .insert(...).select(...), so the insert can otherwise be
-- rolled back with SQLSTATE 42501 even though the INSERT policy passed.
--
-- This migration is intentionally limited to the missing RLS change. The
-- preceding timeline and group-hardening migrations already contain the
-- current project's new tables, fields, indexes, functions, and other RLS
-- changes.

do $$
begin
  if to_regclass('public.groups') is null then
    raise exception using
      errcode = '55000',
      message = 'group creator policy requires migration 202607230001_groups_social_categories.sql';
  end if;
end;
$$;

alter table public.groups enable row level security;

drop policy if exists "group_creators_can_read_own_groups"
on public.groups;

create policy "group_creators_can_read_own_groups"
on public.groups
as permissive
for select
to authenticated
using (
  created_by = (select auth.uid())
);

comment on policy "group_creators_can_read_own_groups"
on public.groups is
  'Lets a group creator read INSERT ... RETURNING directly without widening access to other groups.';

notify pgrst, 'reload schema';

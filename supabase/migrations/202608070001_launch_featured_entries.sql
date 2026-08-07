-- v1.2 launch experience: operationally curated public stories.
-- The browser never receives write privileges for featured_at. Curators use a
-- trusted backend or the SQL Editor; ordinary authors cannot feature themselves.

do $$
begin
  if to_regclass('public.map_entries') is null
    or to_regprocedure('public.can_read_entry(uuid)') is null then
    raise exception using
      errcode = '55000',
      message = 'Featured stories require the existing map entry permission model';
  end if;
end;
$$;

alter table public.map_entries
  add column if not exists featured_at timestamptz;

create index if not exists map_entries_public_featured_idx
  on public.map_entries(featured_at desc, created_at desc, id desc)
  where visibility = 'public' and featured_at is not null;

create or replace function public.maintain_map_entry_featured_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A story that is no longer public, or has become a future capsule, must
  -- leave discovery immediately even if an operator forgets to unfeature it.
  if new.visibility <> 'public'
    or (new.unlock_at is not null and new.unlock_at > now()) then
    new.featured_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists map_entries_maintain_featured_state
on public.map_entries;
create trigger map_entries_maintain_featured_state
before insert or update of visibility, unlock_at, featured_at
on public.map_entries
for each row execute function public.maintain_map_entry_featured_state();

-- Re-applying this migration to an existing test database also cleans any
-- accidentally stale state without deleting or rewriting story content.
update public.map_entries
set featured_at = null
where featured_at is not null
  and (
    visibility <> 'public'
    or (unlock_at is not null and unlock_at > now())
  );

create or replace function public.get_featured_public_entries(
  p_limit integer default 6
)
returns setof public.map_entries
language sql
stable
security invoker
set search_path = ''
as $$
  select entry.*
  from public.map_entries entry
  where entry.featured_at is not null
    and entry.visibility = 'public'
    and (entry.unlock_at is null or entry.unlock_at <= now())
    and public.can_read_entry(entry.id)
  order by entry.featured_at desc, entry.created_at desc, entry.id desc
  limit least(greatest(coalesce(p_limit, 6), 1), 12);
$$;

-- Existing column-level grants intentionally exclude the new field. These
-- explicit revokes make the invariant clear even if an older deployment had
-- broader table privileges.
revoke insert (featured_at) on public.map_entries from authenticated;
revoke update (featured_at) on public.map_entries from authenticated;

revoke all on function public.maintain_map_entry_featured_state()
from public, anon, authenticated;
revoke all on function public.get_featured_public_entries(integer)
from public;
grant execute on function public.get_featured_public_entries(integer)
to anon, authenticated;

comment on column public.map_entries.featured_at is
  'Trusted-operator curation timestamp. Ordinary browser clients have no insert or update privilege for this column.';
comment on function public.get_featured_public_entries(integer) is
  'Returns at most 12 curated stories, always restricted to unlocked public entries readable under current RLS.';

notify pgrst, 'reload schema';

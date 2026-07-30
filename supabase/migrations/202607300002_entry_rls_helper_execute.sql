-- Restore the minimum EXECUTE privileges required by RLS policy helpers.
-- The original collaboration migration revoked PUBLIC execution but omitted
-- grants for the API roles that evaluate the affected SELECT policies.

do $$
begin
  if to_regprocedure(
    'public.can_read_entry_edit_log(uuid,timestamp with time zone)'
  ) is null
    or to_regprocedure('public.can_read_tag(uuid)') is null
  then
    raise exception using
      errcode = '55000',
      message = 'entry RLS helper grants require migration 202607260001_entry_participants_tags.sql';
  end if;
end;
$$;

revoke all on function public.can_read_entry_edit_log(uuid, timestamptz)
from public, anon, authenticated;
grant execute on function public.can_read_entry_edit_log(uuid, timestamptz)
to authenticated;

revoke all on function public.can_read_tag(uuid)
from public, anon, authenticated;
grant execute on function public.can_read_tag(uuid)
to anon, authenticated;

notify pgrst, 'reload schema';

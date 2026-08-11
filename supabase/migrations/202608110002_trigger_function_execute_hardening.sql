-- Story-and-Place regression hardening: trigger functions are internal only.
--
-- PostgreSQL trigger execution does not require API roles to hold EXECUTE on
-- the trigger function. Remove the default PUBLIC grant so these functions do
-- not appear as directly callable RPCs. This does not change trigger behavior,
-- RLS policies or existing data.

do $$
begin
  if to_regprocedure('public.add_group_owner_after_insert()') is not null then
    revoke execute on function public.add_group_owner_after_insert()
      from public, anon, authenticated;
  end if;

  if to_regprocedure('public.validate_entry_participant()') is not null then
    revoke execute on function public.validate_entry_participant()
      from public, anon, authenticated;
  end if;
end;
$$;

notify pgrst, 'reload schema';

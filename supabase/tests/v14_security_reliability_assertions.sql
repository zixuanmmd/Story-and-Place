-- Run only against a disposable local Supabase database after all migrations.
-- This script is transactional and rolls back its rate-limit bucket writes.

\set ON_ERROR_STOP on

begin;

do $$
declare
  function_name text := 'public.consume_server_rate_limit(text,text,integer,integer)';
begin
  if to_regclass('private.rate_limit_buckets') is null then
    raise exception 'private.rate_limit_buckets is missing';
  end if;
  if to_regprocedure(function_name) is null then
    raise exception 'consume_server_rate_limit is missing';
  end if;
  if not (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'private.rate_limit_buckets'::regclass
  ) then
    raise exception 'rate_limit_buckets RLS is not enabled';
  end if;
  if pg_catalog.has_schema_privilege('anon', 'private', 'USAGE')
    or pg_catalog.has_schema_privilege('authenticated', 'private', 'USAGE')
  then
    raise exception 'API roles must not access the private schema';
  end if;
  if pg_catalog.has_function_privilege('anon', function_name, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', function_name, 'EXECUTE')
  then
    raise exception 'browser roles must not execute the server rate limiter';
  end if;
  if not pg_catalog.has_function_privilege('service_role', function_name, 'EXECUTE') then
    raise exception 'service_role must execute the server rate limiter';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_proc procedure
    where procedure.oid = function_name::regprocedure
      and procedure.prosecdef
      and procedure.proconfig is not null
      and exists (
        select 1
        from unnest(procedure.proconfig) as setting
        where setting in ('search_path=', 'search_path=""')
      )
  ) then
    raise exception 'rate limiter must be security definer with an empty search_path';
  end if;
end;
$$;

set local role service_role;

do $$
declare
  first_result record;
  second_result record;
  blocked_result record;
begin
  select * into first_result
  from public.consume_server_rate_limit(
    'v14-sql-assertion', repeat('a', 64), 2, 60
  );
  select * into second_result
  from public.consume_server_rate_limit(
    'v14-sql-assertion', repeat('a', 64), 2, 60
  );
  select * into blocked_result
  from public.consume_server_rate_limit(
    'v14-sql-assertion', repeat('a', 64), 2, 60
  );

  if first_result.allowed is not true or first_result.remaining <> 1 then
    raise exception 'first request should be allowed with one remaining';
  end if;
  if second_result.allowed is not true or second_result.remaining <> 0 then
    raise exception 'second request should be allowed with zero remaining';
  end if;
  if blocked_result.allowed is not false
    or blocked_result.remaining <> 0
    or blocked_result.retry_after_seconds < 1
  then
    raise exception 'third request should be blocked with a retry delay';
  end if;
end;
$$;

reset role;
rollback;

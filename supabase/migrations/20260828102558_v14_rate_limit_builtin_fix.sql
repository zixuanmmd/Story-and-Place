-- Story-and-Place v1.4 Phase 1 follow-up: GREATEST is SQL syntax rather than
-- a pg_catalog function, so schema-qualifying it fails on PostgreSQL 17.

create or replace function public.consume_server_rate_limit(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  remaining integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  bucket private.rate_limit_buckets%rowtype;
  window_duration interval;
begin
  if p_scope is null or char_length(p_scope) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'invalid rate limit scope';
  end if;
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid rate limit key';
  end if;
  if p_limit not between 1 and 10000 then
    raise exception using errcode = '22023', message = 'invalid rate limit size';
  end if;
  if p_window_seconds not between 1 and 86400 then
    raise exception using errcode = '22023', message = 'invalid rate limit window';
  end if;

  window_duration := pg_catalog.make_interval(secs => p_window_seconds);

  insert into private.rate_limit_buckets as existing (
    scope,
    key_hash,
    window_started_at,
    request_count,
    updated_at
  )
  values (p_scope, p_key_hash, v_now, 1, v_now)
  on conflict (scope, key_hash) do update
  set
    window_started_at = case
      when existing.window_started_at <= v_now - window_duration
        then v_now
      else existing.window_started_at
    end,
    request_count = case
      when existing.window_started_at <= v_now - window_duration
        then 1
      else existing.request_count + 1
    end,
    updated_at = v_now
  returning * into bucket;

  allowed := bucket.request_count <= p_limit;
  remaining := greatest(p_limit - bucket.request_count, 0);
  retry_after_seconds := case
    when allowed then 0
    else greatest(
      1,
      pg_catalog.ceil(
        extract(epoch from bucket.window_started_at + window_duration - v_now)
      )::integer
    )
  end;
  return next;
end;
$$;

revoke all on function public.consume_server_rate_limit(text, text, integer, integer)
from public, anon, authenticated;
grant execute on function public.consume_server_rate_limit(text, text, integer, integer)
to service_role;

comment on function public.consume_server_rate_limit(text, text, integer, integer)
is 'Atomically consumes a fixed-window bucket for trusted server routes; identifiers must be HMAC hashed before calling.';

notify pgrst, 'reload schema';

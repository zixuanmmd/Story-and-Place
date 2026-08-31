-- Story-and-Place v1.4 Phase 1: persistent server-side rate limiting.
--
-- The browser cannot call this function. Server routes hash identifiers before
-- sending them to PostgreSQL, so raw IP addresses, e-mail addresses and access
-- tokens are never stored in the bucket table.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table if not exists private.rate_limit_buckets (
  scope text not null,
  key_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null,
  updated_at timestamptz not null default now(),
  primary key (scope, key_hash),
  constraint rate_limit_buckets_scope_length
    check (char_length(scope) between 1 and 80),
  constraint rate_limit_buckets_key_hash_format
    check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint rate_limit_buckets_request_count_positive
    check (request_count >= 1)
);

alter table private.rate_limit_buckets enable row level security;

revoke all on table private.rate_limit_buckets
from public, anon, authenticated;
grant select, insert, update, delete on table private.rate_limit_buckets
to service_role;

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
  current_time timestamptz := clock_timestamp();
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
  values (p_scope, p_key_hash, current_time, 1, current_time)
  on conflict (scope, key_hash) do update
  set
    window_started_at = case
      when existing.window_started_at <= current_time - window_duration
        then current_time
      else existing.window_started_at
    end,
    request_count = case
      when existing.window_started_at <= current_time - window_duration
        then 1
      else existing.request_count + 1
    end,
    updated_at = current_time
  returning * into bucket;

  allowed := bucket.request_count <= p_limit;
  remaining := pg_catalog.greatest(p_limit - bucket.request_count, 0);
  retry_after_seconds := case
    when allowed then 0
    else pg_catalog.greatest(
      1,
      pg_catalog.ceil(
        extract(epoch from bucket.window_started_at + window_duration - current_time)
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

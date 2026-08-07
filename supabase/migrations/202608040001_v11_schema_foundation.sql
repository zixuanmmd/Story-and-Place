-- Story-and-Place v1.1 schema foundation.
--
-- This migration is deliberately structural only. It does not enable the
-- Emotion Tags or Time Capsule product flows, replace permission helpers, or
-- grant clients access to newly added write columns. Later feature migrations
-- will activate each module together with its complete RLS/RPC/trigger rules.

do $$
begin
  if to_regclass('public.tags') is null
    or to_regclass('public.map_entries') is null
    or to_regclass('public.story_route_items') is null
    or to_regprocedure('public.can_read_entry(uuid)') is null
    or to_regprocedure(
      'public.save_story_route(uuid,text,text,text,uuid,boolean,jsonb)'
    ) is null
  then
    raise exception using
      errcode = '55000',
      message = 'v1.1 foundation requires all migrations through 202607300002';
  end if;
end;
$$;

alter table public.tags
  add column type text not null default 'normal',
  add column semantic_key text;

alter table public.tags
  add constraint tags_type_values check (
    type in ('normal', 'emotion', 'theme', 'character', 'event')
  ),
  add constraint tags_semantic_key_format check (
    semantic_key is null
    or (
      char_length(semantic_key) between 2 and 48
      and semantic_key ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'
    )
  ),
  add constraint tags_type_semantic_key_consistency check (
    (type = 'normal' and semantic_key is null)
    or (type = 'emotion' and semantic_key is not null)
    or type in ('theme', 'character', 'event')
  );

create unique index tags_type_semantic_key_uidx
  on public.tags(type, semantic_key)
  where semantic_key is not null;

alter table public.map_entries
  add column unlock_at timestamptz;

create index map_entries_unlock_at_idx
  on public.map_entries(unlock_at, id)
  where unlock_at is not null;

alter table public.story_route_items
  add column relation_type text not null default 'normal',
  add constraint story_route_items_relation_type_values check (
    relation_type in (
      'normal', 'cause', 'memory', 'contrast', 'turning_point'
    )
  );

comment on column public.tags.type is
  'v1.1 tag classification. Existing and legacy-created tags remain normal.';
comment on column public.tags.semantic_key is
  'Optional stable ASCII semantic route key; required for emotion tags.';
comment on column public.map_entries.unlock_at is
  'Time Capsule unlock instant. Null retains the existing visibility model.';
comment on column public.story_route_items.relation_type is
  'Narrative relation from the previous route node; legacy nodes are normal.';

-- Column-level INSERT/UPDATE grants intentionally do not include unlock_at,
-- tags.type, tags.semantic_key, or story_route_items.relation_type. Existing
-- RPCs therefore continue to produce only legacy-compatible defaults until
-- the corresponding v1.1 feature migration is deployed.

notify pgrst, 'reload schema';

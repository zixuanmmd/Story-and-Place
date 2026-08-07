import { z } from "zod";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  emotionSemanticKeySchema,
  tagTypeSchema,
} from "@/lib/validation/tags";
import type {
  MapEntry,
  MapEntryWithProfile,
  Profile,
  TagType,
} from "@/types/database";

export const TAG_PAGE_SIZE = 50;

const tagSummaryRowSchema = z.object({
  slug: z.string().regex(/^[a-f0-9]{20}$/),
  name: z.string().min(1).max(40),
  tag_type: tagTypeSchema,
  semantic_key: z.string().nullable(),
  entry_count: z.coerce.number().int().nonnegative(),
});

export type VisibleTagSummary = {
  slug: string;
  name: string;
  type: TagType;
  semantic_key: string | null;
  entry_count: number;
};

function parseTagSummaryRows(value: unknown): VisibleTagSummary[] {
  return z.array(tagSummaryRowSchema).parse(value).map((row) => ({
    slug: row.slug,
    name: row.name,
    type: row.tag_type,
    semantic_key: row.semantic_key,
    entry_count: row.entry_count,
  }));
}

async function hydrateEntries(rows: MapEntry[]): Promise<MapEntryWithProfile[]> {
  const supabase = getSupabaseBrowserClient();
  const authorIds = [...new Set(rows.map((entry) => entry.user_id))];
  const entryIds = rows.map((entry) => entry.id);
  const [profilesResult, tagsResult] = await Promise.all([
    authorIds.length
      ? supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", authorIds)
      : Promise.resolve({ data: [], error: null }),
    entryIds.length
      ? supabase
          .from("entry_tags")
          .select(
            "entry_id, tag_id, added_by, created_at, tags(id, name, slug, type, semantic_key)",
          )
          .in("entry_id", entryIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (tagsResult.error) throw tagsResult.error;

  const profileById = new Map(
    (profilesResult.data as Array<
      Pick<Profile, "id" | "display_name" | "avatar_url">
    >).map((profile) => [profile.id, profile]),
  );
  const tagsByEntry = new Map<string, typeof tagsResult.data>();
  for (const entryTag of tagsResult.data) {
    const current = tagsByEntry.get(entryTag.entry_id) ?? [];
    current.push(entryTag);
    tagsByEntry.set(entryTag.entry_id, current);
  }
  return rows.map((entry) => ({
    ...entry,
    profiles: profileById.get(entry.user_id) ?? null,
    entry_tags: tagsByEntry.get(entry.id) ?? [],
  })) as MapEntryWithProfile[];
}

export async function getVisibleTagSummary(
  slug: string,
  type: TagType | null = null,
) {
  const { data, error } = await getSupabaseBrowserClient().rpc(
    "get_visible_tag_summary_v11",
    { p_tag_slug: slug, p_tag_type: type },
  );
  if (error) throw error;
  return parseTagSummaryRows(data ?? [])[0] ?? null;
}

export async function listEntriesByTag(
  slug: string,
  page = 0,
  type: TagType | null = null,
) {
  const { data, error } = await getSupabaseBrowserClient().rpc(
    "get_typed_tag_entries",
    {
      p_tag_slug: slug,
      p_tag_type: type,
      p_offset: page * TAG_PAGE_SIZE,
      p_limit: TAG_PAGE_SIZE + 1,
    },
  );
  if (error) throw error;
  const rows = (data ?? []) as unknown as MapEntry[];
  return {
    entries: await hydrateEntries(rows.slice(0, TAG_PAGE_SIZE)),
    hasMore: rows.length > TAG_PAGE_SIZE,
  };
}

export async function listVisibleTags(
  type: TagType | null,
  page = 0,
) {
  const { data, error } = await getSupabaseBrowserClient().rpc(
    "get_visible_tags",
    {
      p_tag_type: type,
      p_offset: page * TAG_PAGE_SIZE,
      p_limit: TAG_PAGE_SIZE + 1,
    },
  );
  if (error) throw error;
  const rows = parseTagSummaryRows(data ?? []);
  return {
    tags: rows.slice(0, TAG_PAGE_SIZE),
    hasMore: rows.length > TAG_PAGE_SIZE,
  };
}

export async function getPublicEmotionSummary(emotion: string) {
  const semanticKey = emotionSemanticKeySchema.parse(emotion);
  const { data, error } = await getSupabaseBrowserClient().rpc(
    "get_public_emotion_summary",
    { p_emotion: semanticKey },
  );
  if (error) throw error;
  return parseTagSummaryRows(data ?? [])[0] ?? null;
}

export async function listPublicEmotionEntries(emotion: string, page = 0) {
  const semanticKey = emotionSemanticKeySchema.parse(emotion);
  const { data, error } = await getSupabaseBrowserClient().rpc(
    "get_public_emotion_entries",
    {
      p_emotion: semanticKey,
      p_offset: page * TAG_PAGE_SIZE,
      p_limit: TAG_PAGE_SIZE + 1,
    },
  );
  if (error) throw error;
  const rows = (data ?? []) as unknown as MapEntry[];
  return {
    entries: await hydrateEntries(rows.slice(0, TAG_PAGE_SIZE)),
    hasMore: rows.length > TAG_PAGE_SIZE,
  };
}

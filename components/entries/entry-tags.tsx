import Link from "next/link";
import type { MapEntryWithProfile } from "@/types/database";

export function EntryTags({ entry }: { entry: MapEntryWithProfile }) {
  const tags = (entry.entry_tags ?? [])
    .map((entryTag) => entryTag.tags)
    .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag));
  if (!tags.length) return null;
  return (
    <div className="entry-tags" aria-label="记录标签">
      {tags.map((tag) => (
        <Link key={tag.id} href={`/tags/${tag.slug}`}>
          #{tag.name}
        </Link>
      ))}
    </div>
  );
}

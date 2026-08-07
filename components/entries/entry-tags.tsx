import Link from "next/link";
import type { MapEntryWithProfile } from "@/types/database";
import { getTagHref } from "@/lib/validation/tags";

export function EntryTags({ entry }: { entry: MapEntryWithProfile }) {
  const tags = (entry.entry_tags ?? [])
    .map((entryTag) => entryTag.tags)
    .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag));
  if (!tags.length) return null;
  return (
    <div className="entry-tags" aria-label="记录标签">
      {tags.map((tag) => (
        <Link
          key={tag.id}
          href={getTagHref(tag)}
          data-tag-type={tag.type}
        >
          #{tag.name}
        </Link>
      ))}
    </div>
  );
}

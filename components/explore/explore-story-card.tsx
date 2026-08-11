import Link from "next/link";
import { EntryTags } from "@/components/entries/entry-tags";
import { getCategoryLabel, PlaceCategoryIcon } from "@/lib/categories/registry";
import type { MapEntryWithProfile } from "@/types/database";

export function ExploreStoryCard({
  entry,
  featured = false,
}: {
  entry: MapEntryWithProfile;
  featured?: boolean;
}) {
  return (
    <article className={`explore-card${featured ? " explore-card--featured" : ""}`}>
      <header>
        <Link href={`/users/${entry.user_id}`}>
          <span className="explore-avatar" aria-hidden="true">
            {entry.profiles?.display_name?.slice(0, 1) ?? "旅"}
          </span>
          <span><strong>{entry.profiles?.display_name ?? "地图旅人"}</strong><small>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(entry.created_at))}</small></span>
        </Link>
        <span className="explore-category"><PlaceCategoryIcon category={entry.place_category_slug} /><small>{getCategoryLabel(entry.place_category_slug)}</small></span>
      </header>
      <div className="explore-card-body">
        <p className="eyebrow">{featured ? `编辑精选 · ${entry.time_label}` : entry.time_label}</p>
        <h3>{entry.title}</h3>
        {entry.place_name ? <p className="explore-place">{entry.place_name}</p> : null}
        <p className="explore-excerpt">{entry.content}</p>
        <EntryTags entry={entry} />
      </div>
      <footer>
        <span>{featured ? "✦ 精选公开故事" : "🌍 所有人可见"}</span>
        <span className="explore-card-links"><Link href={`/entries/${entry.id}`}>阅读故事</Link><Link href={`/?entry=${entry.id}`}>地图定位</Link></span>
      </footer>
    </article>
  );
}

"use client";

import { getCategoryLabel, PlaceCategoryIcon } from "@/lib/categories/registry";
import type { PlaceStoryCluster } from "@/lib/map/place-story-clusters";
import { getEntryPlaybackYear } from "@/lib/map/time-playback";
import { ENTRY_AUDIENCE_PRESENTATION } from "@/lib/privacy/presentation";
import type { MapEntryWithProfile } from "@/types/database";

type PlaceStoryLayerProps = {
  cluster: PlaceStoryCluster;
  onClose: () => void;
  onSelectEntry: (entry: MapEntryWithProfile) => void;
};

function getTimeSpan(cluster: PlaceStoryCluster) {
  const years = cluster.entries
    .map(getEntryPlaybackYear)
    .filter((year): year is number => year !== null);
  if (!years.length) return "时间未定";
  const first = Math.min(...years);
  const last = Math.max(...years);
  return first === last ? `${first} 年` : `${first}—${last} 年`;
}
export function PlaceStoryLayer({
  cluster,
  onClose,
  onSelectEntry,
}: PlaceStoryLayerProps) {
  return (
    <section className="place-story-layer" aria-labelledby="place-story-layer-title">
      <div className="detail-topline">
        <span className="place-story-layer__count">叠放着 {cluster.entries.length} 个故事</span>
        <button className="icon-button" type="button" onClick={onClose} aria-label="关闭地点故事层">×</button>
      </div>
      <p className="eyebrow">SAME PLACE · DIFFERENT TIMES</p>
      <h2 id="place-story-layer-title">{cluster.placeName ?? "这处未命名的地点"}</h2>
      <p className="place-story-layer__intro">
        {getTimeSpan(cluster)} · {cluster.latitude.toFixed(5)}, {cluster.longitude.toFixed(5)}
      </p>
      <p className="place-story-layer__hint">沿时间向下阅读，选择一个故事查看完整内容。</p>

      <ol className="place-story-timeline">
        {cluster.entries.map((entry) => (
          <li key={entry.id}>
            <button type="button" onClick={() => onSelectEntry(entry)}>
              <span className="place-story-timeline__rail" aria-hidden="true" />
              <span className="place-story-timeline__time">{entry.time_label}</span>
              <span className="place-story-timeline__title">{entry.title}</span>
              <span className="place-story-timeline__meta">
                <span><PlaceCategoryIcon category={entry.place_category_slug} size={14} /> {getCategoryLabel(entry.place_category_slug)}</span>
                <span><b aria-hidden="true">{ENTRY_AUDIENCE_PRESENTATION[entry.visibility].glyph}</b> {ENTRY_AUDIENCE_PRESENTATION[entry.visibility].shortLabel}</span>
                {entry.unlock_at ? <span>⌛ 时间胶囊</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getTimePlaybackBounds,
  getTimePlaybackYears,
  normalizeTimePlaybackState,
  type TimePlaybackMode,
  type TimePlaybackState,
} from "@/lib/map/time-playback";
import type { MapEntryWithProfile } from "@/types/database";

type TimePlaybackControlProps = {
  entries: MapEntryWithProfile[];
  filteredCount: number;
  state: TimePlaybackState;
  onChange: (state: TimePlaybackState) => void;
};

const MODES: Array<{ value: TimePlaybackMode; label: string }> = [
  { value: "all", label: "全部时间" },
  { value: "year", label: "单年份" },
  { value: "range", label: "时间范围" },
];

export function TimePlaybackControl({
  entries,
  filteredCount,
  state,
  onChange,
}: TimePlaybackControlProps) {
  const bounds = useMemo(() => getTimePlaybackBounds(entries), [entries]);
  const eventYears = useMemo(() => getTimePlaybackYears(entries), [entries]);
  const [isPlaying, setIsPlaying] = useState(false);
  const normalized = bounds ? normalizeTimePlaybackState(state, bounds) : state;
  const playbackMode = normalized.mode;
  const playbackYear = normalized.year;
  const playbackStartYear = normalized.startYear;
  const playbackEndYear = normalized.endYear;
  const minYear = bounds?.minYear ?? null;
  const maxYear = bounds?.maxYear ?? null;

  useEffect(() => {
    if (
      !isPlaying
      || playbackMode !== "year"
      || playbackYear === null
      || minYear === null
      || maxYear === null
    ) return;
    const timer = window.setInterval(() => {
      if (playbackYear >= maxYear) {
        setIsPlaying(false);
        return;
      }
      const nextYear = eventYears.find((year) => year > playbackYear);
      if (nextYear === undefined) {
        setIsPlaying(false);
        return;
      }
      onChange({
        mode: "year",
        year: nextYear,
        startYear: playbackStartYear,
        endYear: playbackEndYear,
      });
    }, 900);
    return () => window.clearInterval(timer);
  }, [
    isPlaying,
    eventYears,
    maxYear,
    minYear,
    onChange,
    playbackEndYear,
    playbackMode,
    playbackStartYear,
    playbackYear,
  ]);

  const changeMode = (mode: TimePlaybackMode) => {
    setIsPlaying(false);
    if (!bounds) {
      onChange({ ...state, mode });
      return;
    }
    onChange({ ...normalizeTimePlaybackState(state, bounds), mode });
  };

  const currentLabel = !bounds
    ? "没有可播放的年份"
    : normalized.mode === "all"
      ? `${bounds.minYear}—${bounds.maxYear} · 含时间未定故事`
      : normalized.mode === "year"
        ? `${normalized.year} 年`
        : `${normalized.startYear}—${normalized.endYear} 年`;

  return (
    <section className="time-playback" aria-label="地图时间播放">
      <div className="time-playback__heading">
        <div>
          <span className="eyebrow">时间播放地图</span>
          <strong aria-live="polite">{currentLabel}</strong>
        </div>
        <span>{filteredCount} 个故事</span>
      </div>

      <div className="time-playback__modes" aria-label="时间播放模式">
        {MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            aria-pressed={normalized.mode === mode.value}
            onClick={() => changeMode(mode.value)}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {bounds && normalized.mode === "year" ? (
        <div className="time-playback__track-row">
          <button
            className="time-playback__play"
            type="button"
            aria-pressed={isPlaying}
            aria-label={isPlaying ? "暂停时间播放" : "开始时间播放"}
            onClick={() => {
              if ((normalized.year ?? bounds.minYear) >= bounds.maxYear) {
                onChange({ ...normalized, year: bounds.minYear });
              }
              setIsPlaying((current) => !current);
            }}
          >
            <span aria-hidden="true">{isPlaying ? "Ⅱ" : "▶"}</span>
          </button>
          <label>
            <span className="sr-only">播放年份</span>
            <input
              type="range"
              min={bounds.minYear}
              max={bounds.maxYear}
              step={1}
              value={normalized.year ?? bounds.maxYear}
              onChange={(event) => {
                setIsPlaying(false);
                onChange({ ...normalized, year: Number(event.target.value) });
              }}
            />
          </label>
          <output>{normalized.year}</output>
        </div>
      ) : null}

      {bounds && normalized.mode === "range" ? (
        <div className="time-playback__range-grid">
          <label>
            <span>从 {normalized.startYear} 年</span>
            <input
              type="range"
              min={bounds.minYear}
              max={bounds.maxYear}
              step={1}
              value={normalized.startYear ?? bounds.minYear}
              onChange={(event) => onChange(normalizeTimePlaybackState({
                ...normalized,
                startYear: Number(event.target.value),
              }, bounds))}
            />
          </label>
          <label>
            <span>到 {normalized.endYear} 年</span>
            <input
              type="range"
              min={bounds.minYear}
              max={bounds.maxYear}
              step={1}
              value={normalized.endYear ?? bounds.maxYear}
              onChange={(event) => onChange(normalizeTimePlaybackState({
                ...normalized,
                endYear: Number(event.target.value),
              }, bounds))}
            />
          </label>
        </div>
      ) : null}

      {!bounds ? <p>当前筛选结果中没有可识别的年份；“全部时间”仍会显示这些故事。</p> : null}
    </section>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listEntryEditLogs,
  type EntryEditLogWithEditor,
} from "@/lib/data/entry-collaboration";
import { getFriendlyError } from "@/lib/errors";
import { useEntryRealtime } from "@/hooks/use-entry-realtime";

const FIELD_LABELS: Record<string, string> = {
  title: "标题",
  content: "事件内容",
  place_name: "地点名称",
  latitude: "纬度",
  longitude: "经度",
  occurred_at: "发生时刻",
  occurred_local: "当地时间",
  occurred_timezone: "事件时区",
  occurred_date: "发生日期",
  occurred_year: "发生年份",
  time_precision: "时间精度",
  time_label: "时间描述",
  visibility: "可见性",
  group_id: "所属群组",
  place_category_slug: "地点分类",
  allow_comments: "评论设置",
  tags: "标签",
};

export function EntryEditHistory({ entryId }: { entryId: string }) {
  const [logs, setLogs] = useState<EntryEditLogWithEditor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setLogs(await listEntryEditLogs(entryId));
      setError(null);
    } catch (loadError) {
      setError(getFriendlyError(loadError, "编辑记录暂时无法读取。"));
    }
  }, [entryId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEntryRealtime({
    enabled: true,
    scopeKey: `history-${entryId}`,
    includeCollaboration: true,
    onChange: load,
  });

  return (
    <section className="entry-history">
      <h3>编辑记录</h3>
      {error ? <p className="inline-error">{error}</p> : null}
      {logs.length ? (
        <div className="entry-history-list">
          {logs.map((log) => (
            <details key={log.id}>
              <summary>
                <strong>{log.profiles?.display_name ?? "系统"}</strong>
                <span>
                  修改了 {log.changed_fields.map((field) => FIELD_LABELS[field] ?? field).join("、")}
                  {" · "}
                  {new Intl.DateTimeFormat("zh-CN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(log.created_at))}
                </span>
              </summary>
              <div className="entry-history-values">
                <pre>{JSON.stringify(log.old_values, null, 2)}</pre>
                <span aria-hidden="true">→</span>
                <pre>{JSON.stringify(log.new_values, null, 2)}</pre>
              </div>
            </details>
          ))}
        </div>
      ) : (
        <p className="field-meta">接受邀请后的修改会记录在这里。</p>
      )}
    </section>
  );
}

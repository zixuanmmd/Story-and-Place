"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  createComment,
  deleteComment,
  listComments,
  moderateComment,
  updateComment,
  type CommentWithProfile,
} from "@/lib/data/comments";
import {
  getEntrySocialState,
  likeEntry,
  unlikeEntry,
} from "@/lib/data/social";
import { commentSchema } from "@/lib/validation/social";
import { getFriendlyError } from "@/lib/errors";
import type { MapEntryWithProfile } from "@/types/database";
import { ReportDialog } from "@/components/social/report-dialog";
import { getMyGroupRole } from "@/lib/data/groups";
import type { GroupRole } from "@/types/database";
import { mergeUniqueById } from "@/lib/data/keyset-pagination";

export function EntrySocial({ entry }: { entry: MapEntryWithProfile }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<CommentWithProfile[]>([]);
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [groupRole, setGroupRole] = useState<GroupRole | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const loadRequestSequence = useRef(0);

  const load = useCallback(async () => {
    if (entry.visibility === "private") return;
    const requestId = ++loadRequestSequence.current;
    setStatus(null);
    setComments([]);
    setLikeCount(0);
    setLiked(false);
    setHasMore(false);
    setGroupRole(null);
    const [social, page] = await Promise.all([
      getEntrySocialState(entry.id, user?.id ?? null),
      listComments(entry.id),
    ]);
    if (loadRequestSequence.current !== requestId) return;
    setLikeCount(social.likeCount);
    setLiked(social.liked);
    setComments(page.comments);
    setHasMore(page.hasMore);
    if (entry.group_id && user) {
      const nextGroupRole = await getMyGroupRole(entry.group_id, user.id);
      if (loadRequestSequence.current === requestId) {
        setGroupRole(nextGroupRole);
      }
    }
  }, [entry.group_id, entry.id, entry.visibility, user]);

  useEffect(() => {
    let current = true;
    const timer = window.setTimeout(() => {
      void load().catch((error: unknown) => {
        if (current) setStatus(getFriendlyError(error, "互动信息暂时无法加载。"));
      });
    }, 0);
    return () => {
      current = false;
      loadRequestSequence.current += 1;
      window.clearTimeout(timer);
    };
  }, [load]);

  if (entry.visibility === "private") return null;

  const toggleLike = async () => {
    if (!user) {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    setBusy(true);
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount((count) => Math.max(0, count + (wasLiked ? -1 : 1)));
    try {
      if (wasLiked) await unlikeEntry(entry.id, user.id);
      else await likeEntry(entry.id, user.id);
    } catch (error) {
      setLiked(wasLiked);
      setLikeCount((count) => Math.max(0, count + (wasLiked ? 1 : -1)));
      setStatus(getFriendlyError(error, "点赞操作失败，请重试。"));
    } finally {
      setBusy(false);
    }
  };

  const submitComment = async () => {
    if (!user) {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    const parsed = commentSchema.safeParse({ content });
    if (!parsed.success) {
      setStatus(parsed.error.issues[0]?.message ?? "请检查评论内容。");
      return;
    }
    setBusy(true);
    try {
      const created = await createComment(entry.id, user.id, parsed.data.content);
      setComments((current) => [created, ...current]);
      setContent("");
    } catch (error) {
      setStatus(getFriendlyError(error, "评论发布失败，请重试。"));
    } finally {
      setBusy(false);
    }
  };

  const removeComment = async (comment: CommentWithProfile) => {
    setBusy(true);
    try {
      await deleteComment(comment.id);
      setComments((current) =>
        current.map((item) =>
          item.id === comment.id
            ? { ...item, content: "", deleted_at: new Date().toISOString() }
            : item,
        ),
      );
    } catch (error) {
      setStatus(getFriendlyError(error, "评论删除失败。"));
    } finally {
      setBusy(false);
    }
  };

  const saveCommentEdit = async (comment: CommentWithProfile) => {
    const parsed = commentSchema.safeParse({ content: editingContent });
    if (!parsed.success) {
      setStatus(parsed.error.issues[0]?.message ?? "请检查评论内容。");
      return;
    }
    setBusy(true);
    try {
      const updated = await updateComment(comment.id, parsed.data.content);
      setComments((current) => current.map((item) => item.id === comment.id ? updated : item));
      setEditingId(null);
      setEditingContent("");
    } catch (error) {
      setStatus(getFriendlyError(error, "评论修改失败。"));
    } finally {
      setBusy(false);
    }
  };

  const hideComment = async (comment: CommentWithProfile) => {
    setBusy(true);
    try {
      await moderateComment(comment.id);
      setComments((current) =>
        current.map((item) =>
          item.id === comment.id
            ? { ...item, content: "", deleted_at: new Date().toISOString() }
            : item,
        ),
      );
    } catch (error) {
      setStatus(getFriendlyError(error, "评论隐藏失败。"));
    } finally {
      setBusy(false);
    }
  };

  const loadMore = async () => {
    const lastComment = comments.at(-1);
    if (!lastComment) return;
    setBusy(true);
    try {
      const page = await listComments(entry.id, {
        timestamp: lastComment.created_at,
        id: lastComment.id,
      });
      setComments((current) =>
        mergeUniqueById(current, page.comments),
      );
      setHasMore(page.hasMore);
    } catch (error) {
      setStatus(getFriendlyError(error, "更多评论加载失败。"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="entry-social" aria-label="点赞和评论">
      <div className="social-actions">
        <button type="button" aria-pressed={liked} disabled={busy} onClick={() => void toggleLike()}>
          {liked ? "已喜欢" : "喜欢"} · {likeCount}
        </button>
        <span>{comments.length}{hasMore ? "+" : ""} 条评论</span>
        <ReportDialog targetType="entry" targetId={entry.id} />
      </div>
      {status ? <p className="inline-error" role="status">{status}</p> : null}
      {entry.allow_comments ? (
        <div className="comment-composer">
          <textarea
            rows={3}
            maxLength={1000}
            value={content}
            placeholder={user ? "写下一点回应……" : "登录后参与评论"}
            onChange={(event) => setContent(event.target.value)}
          />
          <button className="secondary-button" type="button" disabled={busy} onClick={() => void submitComment()}>
            {busy ? "处理中…" : "发布评论"}
          </button>
        </div>
      ) : <p className="field-meta">作者已关闭新评论。</p>}
      <div className="comment-list">
        {comments.map((comment) => (
          <article key={comment.id} className="comment-item">
            <div>
              <Link href={`/users/${comment.user_id}`}>{comment.profiles?.display_name ?? "地图旅人"}</Link>
              <time>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(comment.created_at))}</time>
            </div>
            {editingId === comment.id ? (
              <div className="comment-edit">
                <textarea maxLength={1000} rows={3} value={editingContent} onChange={(event) => setEditingContent(event.target.value)} />
                <div className="record-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => void saveCommentEdit(comment)}>保存</button><button className="quiet-button" type="button" onClick={() => setEditingId(null)}>取消</button></div>
              </div>
            ) : <p>{comment.deleted_at ? "该评论已删除" : comment.content}</p>}
            {!comment.deleted_at && comment.user_id === user?.id ? (
              <div className="record-actions">
                <button className="quiet-button" type="button" disabled={busy} onClick={() => { setEditingId(comment.id); setEditingContent(comment.content); }}>编辑</button>
                <button className="quiet-button" type="button" disabled={busy} onClick={() => void removeComment(comment)}>删除</button>
              </div>
            ) : null}
            {!comment.deleted_at && comment.user_id !== user?.id && (groupRole === "owner" || groupRole === "admin") ? <button className="quiet-button" type="button" disabled={busy} onClick={() => void hideComment(comment)}>隐藏不当评论</button> : null}
            {!comment.deleted_at ? <ReportDialog targetType="comment" targetId={comment.id} /> : null}
          </article>
        ))}
      </div>
      {hasMore ? <button className="quiet-button" type="button" disabled={busy} onClick={() => void loadMore()}>加载更多评论</button> : null}
    </section>
  );
}

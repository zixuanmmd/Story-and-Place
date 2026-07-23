"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/navigation/app-header";
import { useAuth } from "@/components/providers/auth-provider";
import { getPublicProfile, listPublicProfileEntries } from "@/lib/data/profiles";
import { followUser, getFollowState, unfollowUser } from "@/lib/data/social";
import { getFriendlyError } from "@/lib/errors";
import type { MapEntryWithProfile, Profile } from "@/types/database";
import { PlaceCategoryIcon, getCategoryLabel } from "@/lib/categories/registry";
import { ReportDialog } from "@/components/social/report-dialog";

export function PublicProfileView({ profileId }: { profileId: string }) {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [entries, setEntries] = useState<MapEntryWithProfile[]>([]);
  const [followers, setFollowers] = useState(0);
  const [publicCount, setPublicCount] = useState(0);
  const [following, setFollowing] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (authLoading) return;
    try {
      const [nextProfile, entryPage, social] = await Promise.all([
        getPublicProfile(profileId),
        listPublicProfileEntries(profileId, 20),
        getFollowState(user?.id ?? null, profileId),
      ]);
      setProfile(nextProfile);
      setEntries(entryPage.entries);
      setPublicCount(entryPage.count);
      setFollowers(social.followerCount);
      setFollowing(social.followingCount);
      setIsFollowing(social.isFollowing);
    } catch (error) {
      setStatus(getFriendlyError(error, "用户主页暂时无法加载。"));
    }
  }, [authLoading, profileId, user]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const toggleFollow = async () => {
    if (!user) {
      window.location.assign(`/login?next=${encodeURIComponent(`/users/${profileId}`)}`);
      return;
    }
    setBusy(true);
    const previous = isFollowing;
    setIsFollowing(!previous);
    setFollowers((count) => Math.max(0, count + (previous ? -1 : 1)));
    try {
      if (previous) await unfollowUser(user.id, profileId);
      else await followUser(user.id, profileId);
    } catch (error) {
      setIsFollowing(previous);
      setFollowers((count) => Math.max(0, count + (previous ? 1 : -1)));
      setStatus(getFriendlyError(error, "关注操作失败。"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="content-page">
      <AppHeader />
      <div className="content-container">
        {!profile ? <div className="content-state"><h1>{status ? "无法打开用户主页" : "正在读取用户主页…"}</h1><p>{status}</p></div> : (
          <>
            <section className="profile-hero">
              <div className="profile-avatar" aria-label={`${profile.display_name}的头像`}>{profile.avatar_url ? <span className="remote-avatar" style={{ backgroundImage: `url("${profile.avatar_url.replaceAll('"', "%22")}")` }} /> : profile.display_name.slice(0, 1)}</div>
              <div><p className="eyebrow">PUBLIC PROFILE</p><h1>{profile.display_name}</h1><p>{profile.bio || "这个人还没有写下简介。"}</p><small>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "long" }).format(new Date(profile.created_at))} 加入</small></div>
              <div className="profile-actions">
                <dl className="profile-counts"><div><dt>公开记录</dt><dd>{publicCount}</dd></div><div><dt>关注者</dt><dd>{followers}</dd></div><div><dt>正在关注</dt><dd>{following}</dd></div></dl>
                {user?.id === profile.id ? <div className="record-actions"><Link className="secondary-button nav-link" href="/settings">编辑资料</Link><Link className="secondary-button nav-link" href="/my-records">我的记录</Link><Link className="secondary-button nav-link" href="/groups">我的群组</Link></div> : <button className="primary-button" type="button" aria-pressed={isFollowing} disabled={busy} onClick={() => void toggleFollow()}>{busy ? "处理中…" : isFollowing ? "取消关注" : "关注"}</button>}
                {user?.id !== profile.id ? <ReportDialog targetType="user" targetId={profile.id} /> : null}
              </div>
            </section>
            {status ? <div className="inline-error" role="status">{status}</div> : null}
            <section className="content-section"><h2>公开记录</h2>{entries.length ? <div className="records-list">{entries.map((entry) => <article className="record-card" key={entry.id}><PlaceCategoryIcon category={entry.place_category_slug} /><div><p className="eyebrow">{getCategoryLabel(entry.place_category_slug)} · {entry.time_label}</p><h3>{entry.title}</h3><p className="record-excerpt">{entry.content}</p><Link href={`/?entry=${entry.id}`}>在地图上打开</Link></div></article>)}</div> : <div className="small-empty">还没有公开记录。</div>}</section>
          </>
        )}
      </div>
    </main>
  );
}

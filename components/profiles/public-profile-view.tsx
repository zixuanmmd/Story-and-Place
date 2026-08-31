"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/navigation/app-header";
import { useAuth } from "@/components/providers/auth-provider";
import { ReportDialog } from "@/components/social/report-dialog";
import { PlaceCategoryIcon, getCategoryLabel } from "@/lib/categories/registry";
import {
  getPublicLifePathSummary,
  listPublicLifePathEntries,
} from "@/lib/data/life-path";
import { getPublicProfile } from "@/lib/data/profiles";
import { followUser, getFollowState, unfollowUser } from "@/lib/data/social";
import { listPublicStoryRoutesByCreator } from "@/lib/data/story-routes";
import { getFriendlyError } from "@/lib/errors";
import {
  formatLifePathSpan,
  toLifePathRouteItems,
  type LifePathSummary,
} from "@/lib/life-path/life-path";
import type {
  MapEntry,
  Profile,
  StoryRouteItemWithEntry,
  StoryRouteWithRelations,
} from "@/types/database";
import { GuidedEmptyState } from "@/components/ui/guided-empty-state";
import { PublicStoryList } from "@/components/profiles/public-story-list";
import { recordProductEvent } from "@/lib/analytics/provider";

const LifePathMap = dynamic(
  () => import("@/components/routes/story-route-map").then((module) => module.StoryRouteMap),
  { ssr: false, loading: () => <div className="map-loading">正在展开人生轨迹…</div> },
);

const EMPTY_SUMMARY: LifePathSummary = {
  public_story_count: 0,
  earliest_year: null,
  latest_year: null,
  distinct_place_count: 0,
  first_time_label: null,
  last_time_label: null,
};

export function PublicProfileView({ profileIdentifier }: { profileIdentifier: string }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const currentUserId = user?.id ?? null;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [entries, setEntries] = useState<MapEntry[]>([]);
  const [summary, setSummary] = useState<LifePathSummary>(EMPTY_SUMMARY);
  const [routes, setRoutes] = useState<StoryRouteWithRelations[]>([]);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const requestSequence = useRef(0);
  const trackedPublicOpen = useRef(false);

  const load = useCallback(async () => {
    if (authLoading) return;
    const requestId = ++requestSequence.current;
    setLoading(true);
    setStatus(null);
    try {
      const nextProfile = await getPublicProfile(profileIdentifier);
      if (requestSequence.current !== requestId) return;
      if (!nextProfile) {
        setProfile(null);
        setEntries([]);
        setRoutes([]);
        setSummary(EMPTY_SUMMARY);
        setStatus("这个用户不存在，或公开资料暂时不可用。");
        return;
      }
      const [pathPage, nextSummary, nextRoutes, social] = await Promise.all([
        listPublicLifePathEntries(nextProfile.id),
        getPublicLifePathSummary(nextProfile.id),
        listPublicStoryRoutesByCreator(nextProfile.id, 6),
        getFollowState(currentUserId, nextProfile.id),
      ]);
      if (requestSequence.current !== requestId) return;
      setProfile(nextProfile);
      if (!trackedPublicOpen.current) {
        trackedPublicOpen.current = true;
        recordProductEvent("public_profile_opened", { source: "public-profile" });
      }
      setEntries(pathPage.entries);
      setTruncated(pathPage.truncated);
      setSummary(nextSummary);
      setRoutes(nextRoutes);
      setFollowers(social.followerCount);
      setFollowing(social.followingCount);
      setIsFollowing(social.isFollowing);
    } catch (error) {
      if (requestSequence.current !== requestId) return;
      setProfile(null);
      setEntries([]);
      setRoutes([]);
      setSummary(EMPTY_SUMMARY);
      setStatus(getFriendlyError(error, "用户主页暂时无法加载。"));
    } finally {
      if (requestSequence.current === requestId) setLoading(false);
    }
  }, [authLoading, currentUserId, profileIdentifier]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      requestSequence.current += 1;
      window.clearTimeout(timer);
    };
  }, [load]);

  const routeItems = useMemo(
    () => profile ? toLifePathRouteItems(entries, profile) : [],
    [entries, profile],
  );
  const selected = useMemo(
    () => routeItems.find((item) => item.id === selectedId) ?? null,
    [routeItems, selectedId],
  );

  const toggleFollow = async () => {
    if (!profile) return;
    if (!currentUserId) {
      router.push(`/login?next=${encodeURIComponent(`/users/${profile.username}`)}`);
      return;
    }
    setBusy(true);
    const previous = isFollowing;
    setIsFollowing(!previous);
    setFollowers((count) => Math.max(0, count + (previous ? -1 : 1)));
    try {
      if (previous) await unfollowUser(currentUserId, profile.id);
      else await followUser(currentUserId, profile.id);
    } catch (error) {
      setIsFollowing(previous);
      setFollowers((count) => Math.max(0, count + (previous ? 1 : -1)));
      setStatus(getFriendlyError(error, "关注操作失败。"));
    } finally {
      setBusy(false);
    }
  };

  const selectPathNode = (item: StoryRouteItemWithEntry) => {
    setSelectedId(item.id);
    document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <main className="content-page">
      <AppHeader />
      <div className="content-container">
        {loading ? <div className="content-state" role="status">正在读取用户的人生轨迹…</div> : !profile ? (
          <div className="content-state">
            <h1>无法打开用户主页</h1>
            <p>{status}</p>
            <div className="record-actions"><button type="button" onClick={() => void load()}>重试</button><Link href="/">返回地图</Link></div>
          </div>
        ) : (
          <>
            <section className="profile-hero">
              <div className="profile-avatar" aria-label={`${profile.display_name}的头像`}>{profile.avatar_url ? <span className="remote-avatar" style={{ backgroundImage: `url("${profile.avatar_url.replaceAll('"', "%22")}")` }} /> : profile.display_name.slice(0, 1)}</div>
              <div><p className="eyebrow">PUBLIC LIFE PATH</p><h1>{profile.display_name}</h1><p className="profile-handle">@{profile.username}</p><p>{profile.bio || "这个人还没有写下简介。"}</p><small>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "long" }).format(new Date(profile.created_at))} 加入</small></div>
              <div className="profile-actions">
                <dl className="profile-counts">
                  <div><dt>公开故事</dt><dd>{summary.public_story_count}</dd></div>
                  <div><dt>时间跨度</dt><dd className="profile-span-value">{formatLifePathSpan(summary)}</dd></div>
                  <div><dt>公开地点</dt><dd>{summary.distinct_place_count}</dd></div>
                  <div><dt>关注者</dt><dd>{followers}</dd></div>
                  <div><dt>正在关注</dt><dd>{following}</dd></div>
                </dl>
                {currentUserId === profile.id ? <div className="record-actions"><Link className="secondary-button nav-link" href="/settings">编辑资料</Link><Link className="secondary-button nav-link" href="/my-records">我的记录</Link><Link className="secondary-button nav-link" href="/timeline">我的时间线</Link><Link className="secondary-button nav-link" href="/groups">我的群组</Link></div> : <button className="primary-button" type="button" aria-pressed={isFollowing} disabled={busy} onClick={() => void toggleFollow()}>{busy ? "处理中…" : isFollowing ? "取消关注" : "关注"}</button>}
                {currentUserId !== profile.id ? <ReportDialog targetType="user" targetId={profile.id} /> : null}
              </div>
            </section>
            {status ? <div className="inline-error" role="status">{status}</div> : null}

            <PublicStoryList profile={profile} isOwnProfile={currentUserId === profile.id} />

            <section className="content-section life-path-section">
              <div className="section-heading"><div><p className="eyebrow">LIFE PATH</p><h2>地理迁移轨迹</h2></div><Link href={`/users/${profile.username}/timeline`}>查看公开时间线</Link></div>
              <p className="section-intro">按照故事发生时间连接公开地点。私密、群组故事和尚未解锁的时间胶囊不会出现在这里。</p>
              {truncated ? <div className="inline-notice">轨迹只显示最早的 200 个公开地点；完整浏览请进入时间线。</div> : null}
              {entries.length ? (
                <div className="life-path-layout">
                  <div className="life-path-map-panel" aria-label="公开人生轨迹地图">
                    <LifePathMap items={routeItems} selectedItemId={selectedId} onSelect={selectPathNode} onTileError={() => setStatus("地图瓦片加载失败，请检查网络后重试。")} />
                  </div>
                  <div className="life-path-node-list" aria-label="公开人生轨迹节点">
                    {selected?.map_entries ? <div className="life-path-selected"><p className="eyebrow">地图中选中</p><strong>{selected.position}. {selected.map_entries.title}</strong></div> : null}
                    {routeItems.map((item) => item.map_entries ? (
                      <article id={item.id} className={`life-path-node${selectedId === item.id ? " life-path-node--selected" : ""}`} key={item.id}>
                        <button type="button" onClick={() => selectPathNode(item)}>
                          <span className="route-order-number">{item.position}</span>
                          <PlaceCategoryIcon category={item.map_entries.place_category_slug} />
                          <span><strong>{item.map_entries.title}</strong><small>{item.map_entries.time_label} · {item.map_entries.place_name || getCategoryLabel(item.map_entries.place_category_slug)}</small></span>
                        </button>
                        <Link href={`/?entry=${item.entry_id}`}>在地图上打开</Link>
                      </article>
                    ) : null)}
                  </div>
                </div>
              ) : <GuidedEmptyState title={currentUserId === profile.id ? "你的人生轨迹正在等待第一个公开地点。" : "这段公开人生轨迹还没有开始。"} description={currentUserId === profile.id ? "创建故事并选择公开后，地点会沿时间连接起来。" : "当这个人分享公开故事后，地点与时间会在这里相遇。"} compact>{currentUserId === profile.id ? <Link className="primary-button nav-link" href="/">创建故事</Link> : null}</GuidedEmptyState>}
            </section>

            <section className="content-section">
              <div className="section-heading"><div><p className="eyebrow">REPRESENTATIVE ROUTES</p><h2>代表性故事线路</h2></div>{currentUserId === profile.id ? <Link href="/routes">管理我的线路</Link> : <span>最近公开发布</span>}</div>
              {routes.length ? <div className="route-card-grid">{routes.map((route) => (
                <article className="route-card" key={route.id}>
                  <header><span>公开线路</span><small>{route.node_count} 个节点</small></header>
                  <h3><Link href={`/routes/${route.share_slug}`}>{route.title}</Link></h3>
                  <p>{route.description || "这条线路还没有说明。"}</p>
                  <small>{route.published_at ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(route.published_at)) : ""}</small>
                </article>
              ))}</div> : <GuidedEmptyState title={currentUserId === profile.id ? "还没有公开的故事线路。" : "这个人还没有分享故事线路。"} description={currentUserId === profile.id ? "把几个地点连接起来，让它们形成完整的叙事。" : "公开线路发布后会出现在这里。"} compact>{currentUserId === profile.id ? <Link className="quiet-button nav-link" href="/routes/new">创建线路</Link> : null}</GuidedEmptyState>}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

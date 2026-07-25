"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listGroupStoryRoutes } from "@/lib/data/story-routes";
import { getFriendlyError } from "@/lib/errors";
import type { StoryRouteWithRelations } from "@/types/database";

export function GroupStoryRoutes({ groupId, groupSlug }: { groupId: string; groupSlug: string }) {
  const [routes, setRoutes] = useState<StoryRouteWithRelations[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void listGroupStoryRoutes(groupId)
      .then((result) => {
        if (active) setRoutes(result.routes);
      })
      .catch((error) => {
        if (active) setStatus(getFriendlyError(error, "群组路线暂时无法加载。"));
      });
    return () => {
      active = false;
    };
  }, [groupId]);
  return (
    <section className="content-section group-route-section">
      <div className="section-heading"><div><p className="eyebrow">CURATED ROUTES</p><h2>群组故事路线</h2></div><div className="record-actions"><Link href={`/groups/${groupSlug}/timeline`}>群组时间线</Link><Link href="/routes/new">整理路线</Link></div></div>
      {status ? <div className="inline-error">{status}</div> : null}
      {routes.length ? <div className="route-card-grid">{routes.map((route) => <article className="route-card" key={route.id}><header>{route.featured_at ? <span>群组置顶</span> : <span>成员路线</span>}</header><h3><Link href={`/routes/${route.share_slug}`}>{route.title}</Link></h3><p>{route.description || "还没有路线说明。"}</p><small>{route.node_count} 个节点 · {route.profiles?.display_name ?? "未知作者"}</small></article>)}</div> : !status ? <div className="small-empty">群组里还没有已发布的故事路线。</div> : null}
    </section>
  );
}

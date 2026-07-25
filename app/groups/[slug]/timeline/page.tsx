import { Suspense } from "react";
import { TimelineView } from "@/components/timeline/timeline-view";

export default async function GroupTimelinePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Suspense fallback={<div className="page-loading">正在展开群组时间线…</div>}><TimelineView mode="group" groupSlug={slug} /></Suspense>;
}

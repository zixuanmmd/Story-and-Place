import { Suspense } from "react";
import { TimelineView } from "@/components/timeline/timeline-view";

export default async function UserTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={<div className="page-loading">正在展开公开时间线…</div>}><TimelineView mode="user" targetUserId={id} /></Suspense>;
}

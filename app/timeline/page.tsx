import { Suspense } from "react";
import { TimelineView } from "@/components/timeline/timeline-view";

export default function TimelinePage() {
  return <Suspense fallback={<div className="page-loading">正在展开时间线…</div>}><TimelineView mode="mine" /></Suspense>;
}

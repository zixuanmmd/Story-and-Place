import { MapExperience } from "@/components/map/map-experience";
import { Suspense } from "react";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="page-loading">正在展开地图…</div>}>
      <MapExperience />
    </Suspense>
  );
}

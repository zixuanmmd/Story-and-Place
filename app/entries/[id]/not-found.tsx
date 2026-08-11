import Link from "next/link";
import { AppHeader } from "@/components/navigation/app-header";

export default function EntryNotFound() {
  return (
    <main className="content-page">
      <AppHeader />
      <div className="content-container">
        <div className="content-state">
          <p className="eyebrow">STORY NOT AVAILABLE</p>
          <h1>这个故事暂时无法打开</h1>
          <p>链接可能已经失效，或者这个故事目前不对你开放。</p>
          <Link className="primary-button" href="/">返回地图</Link>
        </div>
      </div>
    </main>
  );
}

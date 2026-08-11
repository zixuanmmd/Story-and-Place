import Link from "next/link";
import { AppHeader } from "@/components/navigation/app-header";

export default function NotFound() {
  return (
    <main className="content-page">
      <AppHeader />
      <div className="content-container">
        <div className="content-state">
          <p className="eyebrow">PLACE NOT FOUND</p>
          <h1>这里还没有留下故事。</h1>
          <p>地址可能已经改变，也可能这段内容目前不对你开放。</p>
          <div className="record-actions">
            <Link className="primary-button" href="/">
              返回地图
            </Link>
            <Link className="secondary-button" href="/search">
              搜索故事
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

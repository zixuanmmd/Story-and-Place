"use client";

import { useEffect } from "react";
import Link from "next/link";
import { reportOperationalError } from "@/lib/errors";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportOperationalError(error, "app-error-boundary");
  }, [error]);

  return (
    <main className="fatal-error-page">
      <section>
        <p className="eyebrow">暂时中断</p>
        <h1>这一页没有顺利展开</h1>
        <p>你的数据没有因此被修改。可以重试，或回到地图首页。</p>
        <div className="form-actions">
          <button className="primary-button" type="button" onClick={reset}>
            再试一次
          </button>
          <Link className="secondary-button" href="/">
            返回地图
          </Link>
        </div>
      </section>
    </main>
  );
}

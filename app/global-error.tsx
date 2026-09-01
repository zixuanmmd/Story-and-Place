"use client";

import { useEffect } from "react";
import { reportOperationalError } from "@/lib/errors";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportOperationalError(error, "global-error-boundary");
  }, [error]);

  return (
    <html lang="zh-CN">
      <body>
        <main className="fatal-error-page">
          <section>
            <p>应用暂时没有顺利展开。</p>
            <button className="primary-button" type="button" onClick={reset}>再试一次</button>
          </section>
        </main>
      </body>
    </html>
  );
}

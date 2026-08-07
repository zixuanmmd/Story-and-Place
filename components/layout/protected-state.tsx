import Link from "next/link";
import { getAuthPageHref } from "@/lib/navigation/safe-redirect";

type ProtectedStateProps = {
  kind: "loading" | "signed-out" | "config";
  signedOutDescription?: string;
  nextPath?: string;
};

export function ProtectedState({
  kind,
  signedOutDescription = "登录后可以管理所有阅读范围下的个人故事。",
  nextPath,
}: ProtectedStateProps) {
  if (kind === "loading") {
    return <div className="content-state" role="status"><span className="loading-dot" />正在读取账户信息…</div>;
  }

  if (kind === "config") {
    return (
      <div className="content-state">
        <span className="state-symbol" aria-hidden="true">!</span>
        <h2>还需要连接 Supabase</h2>
        <p>填写本地环境变量并执行数据库 migration 后，账户功能才会启用。</p>
        <Link className="secondary-button nav-link" href="/">返回地图</Link>
      </div>
    );
  }

  return (
    <div className="content-state">
      <span className="state-symbol" aria-hidden="true">▣</span>
      <h2>登录后才能查看这里</h2>
      <p>{signedOutDescription}</p>
      <Link
        className="primary-button nav-link"
        href={getAuthPageHref(
          "/login",
          nextPath,
          "http://local.story-map",
        )}
      >
        前往登录
      </Link>
    </div>
  );
}

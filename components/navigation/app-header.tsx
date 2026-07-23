"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { getFriendlyError } from "@/lib/errors";

export function AppHeader() {
  const { user, profile, loading, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSignOut = async () => {
    setBusy(true);
    setError(null);
    try {
      await signOut();
      router.replace("/");
      router.refresh();
    } catch (signOutError) {
      setError(getFriendlyError(signOutError, "退出登录失败，请重试。"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="app-header">
      <Link href="/" className="brand-link" aria-label="故事情感地图首页">
        <p className="brand-kicker">STORY & PLACE</p>
        <span className="brand-title">故事情感地图</span>
      </Link>
      <nav className="main-nav" aria-label="主导航">
        {error ? <span className="header-error" role="alert">{error}</span> : null}
        <Link className="quiet-button nav-link" href="/groups">群组</Link>
        {user ? (
          <>
            <Link className="quiet-button nav-link" href="/feed">信息流</Link>
            <Link className="quiet-button nav-link" href="/my-records">我的记录</Link>
            <Link className="quiet-button nav-link" href="/settings">{profile?.display_name ?? "个人设置"}</Link>
            <button className="secondary-button" type="button" onClick={handleSignOut} disabled={busy}>
              {busy ? "退出中…" : "退出"}
            </button>
          </>
        ) : loading ? (
          <span className="nav-loading">读取登录状态…</span>
        ) : (
          <>
            <Link className="quiet-button nav-link" href="/login">登录</Link>
            <Link className="primary-button nav-link" href="/register">注册</Link>
          </>
        )}
      </nav>
    </header>
  );
}

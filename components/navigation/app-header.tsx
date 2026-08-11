"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { getFriendlyError } from "@/lib/errors";

export function AppHeader() {
  const { user, profile, loading, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current
      ?.querySelector<HTMLElement>("a, button:not([disabled])")
      ?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      toggleRef.current?.focus();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const handleSignOut = async () => {
    setBusy(true);
    setError(null);
    setMenuOpen(false);
    try {
      await signOut();
      router.replace("/");
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
      <button
        ref={toggleRef}
        className="mobile-nav-toggle"
        type="button"
        aria-label="打开主导航"
        aria-controls="main-navigation"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((current) => !current)}
      >
        <span aria-hidden="true">☰</span>
        菜单
      </button>
      <nav
        ref={menuRef}
        id="main-navigation"
        className={`main-nav${menuOpen ? " main-nav--open" : ""}`}
        aria-label="主导航"
        onClick={() => setMenuOpen(false)}
      >
        {error ? <span className="header-error" role="alert">{error}</span> : null}
        <Link className="quiet-button nav-link" href="/search">搜索</Link>
        <Link className="quiet-button nav-link" href="/explore">探索</Link>
        <Link className="quiet-button nav-link" href="/tags">标签</Link>
        <Link className="quiet-button nav-link" href="/groups">群组</Link>
        {user ? (
          <>
            <Link className="quiet-button nav-link" href="/feed">信息流</Link>
            <Link className="quiet-button nav-link" href="/timeline">时间线</Link>
            <Link className="quiet-button nav-link" href="/routes">路线</Link>
            <Link className="quiet-button nav-link" href="/entry-invitations">共同邀请</Link>
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

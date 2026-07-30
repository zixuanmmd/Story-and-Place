"use client";

import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/components/providers/auth-provider";

function AuthDataBoundary({ children }: { children: ReactNode }) {
  const { dataReady, dataScope } = useAuth();

  if (!dataReady) {
    return <div className="page-loading" role="status">正在更新登录状态…</div>;
  }

  return <AuthScopedTree key={dataScope}>{children}</AuthScopedTree>;
}

function AuthScopedTree({ children }: { children: ReactNode }) {
  return children;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AuthDataBoundary>{children}</AuthDataBoundary>
    </AuthProvider>
  );
}

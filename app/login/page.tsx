import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "登录" };

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="page-loading">正在准备登录…</div>}>
      <AuthForm mode="login" />
    </Suspense>
  );
}

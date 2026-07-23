import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "注册" };

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="page-loading">正在准备注册…</div>}>
      <AuthForm mode="register" />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { PasswordResetForm } from "@/components/auth/password-reset-form";

export const metadata: Metadata = {
  title: "设置新密码",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return <PasswordResetForm />;
}

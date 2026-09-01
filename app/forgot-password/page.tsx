import type { Metadata } from "next";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";

export const metadata: Metadata = { title: "找回密码" };

export default function ForgotPasswordPage() {
  return <PasswordRecoveryForm />;
}

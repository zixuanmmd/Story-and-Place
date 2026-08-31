import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminConsole } from "@/components/admin/admin-console";
import { hasVerifiedAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = {
  title: "运营管理",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  if (!(await hasVerifiedAdminSession())) notFound();
  return <AdminConsole />;
}

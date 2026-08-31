import type { Metadata } from "next";
import { StatusView } from "@/components/status/status-view";

export const metadata: Metadata = {
  title: "服务状态",
  description: "查看故事情感地图 Web App、数据库和媒体服务的当前状态。",
};

export default function StatusPage() {
  return <StatusView />;
}

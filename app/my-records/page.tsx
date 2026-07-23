import type { Metadata } from "next";
import { MyRecordsView } from "@/components/entries/my-records-view";

export const metadata: Metadata = { title: "我的记录" };

export default function MyRecordsPage() {
  return <MyRecordsView />;
}

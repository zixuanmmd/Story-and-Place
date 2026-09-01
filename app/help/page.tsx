import type { Metadata } from "next";
import Link from "next/link";
import { ProductInfoPage } from "@/components/product/product-info-page";

export const metadata: Metadata = {
  title: "帮助中心",
  description: "了解故事、故事线路、时间胶囊、共同经历、群组与数据管理。",
};

export default function HelpPage() {
  return (
    <ProductInfoPage
      eyebrow="HELP"
      title="帮助中心"
      introduction="从一个地点开始，慢慢整理时间、关系和属于你的空间叙事。"
      sections={[
        {
          id: "story",
          title: "什么是 Story？",
          content: <p>Story 是一条带有地点和时间的故事记录。你可以写下标题、正文、地点分类、标签与情绪，并选择只有自己、群组成员或所有人可以看到。</p>,
        },
        {
          id: "route",
          title: "什么是 Story Route？",
          content: <p>Story Route 把多条已有 Story 按顺序连接成一条叙事线路。路线只引用原记录，不复制正文；记录权限变化时，路线也会同步保护不可见节点。</p>,
        },
        {
          id: "capsule",
          title: "时间胶囊",
          content: <p>设置未来解锁时间后，胶囊在解锁前只对创建者可见。共同经历者、搜索、分享页和公开地图都不能提前绕过解锁时间。</p>,
        },
        {
          id: "privacy",
          title: "隐私与可见范围",
          content: <><p>“只有我”仅创建者可见；“群组成员”要求有效群组身份；“所有人”可由访客浏览。关注、标签、邀请或分享链接都不会自动扩大读取权限。</p><p><Link href="/privacy">阅读隐私说明草案</Link></p></>,
        },
        {
          id: "collaboration",
          title: "共同经历与协作",
          content: <p>被邀请者接受后才成为共同经历者。创建者可以分别授予时间、地点、正文或标签编辑权限；删除、可见范围和群组归属始终由创建者控制。</p>,
        },
        {
          id: "groups",
          title: "群组",
          content: <p>公开群组可由登录用户加入，私密群组需要邀请。退出或被移出后，群组 Story、评论、点赞与媒体会立即失去访问权限。</p>,
        },
        {
          id: "data",
          title: "导出与删除账号",
          content: <><p>设置页支持导出 JSON、CSV 与 GeoJSON。删除账号前会展示数据影响；群主需要先处理群组责任，协作参与者退出不会删除原作者的内容。</p><p><Link href="/settings">前往用户设置</Link></p></>,
        },
      ]}
    />
  );
}

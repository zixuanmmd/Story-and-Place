import type { Metadata } from "next";
import { ProductInfoPage } from "@/components/product/product-info-page";

export const metadata: Metadata = {
  title: "服务条款草案",
  description: "故事情感地图服务条款草案，待正式法律审阅。",
};

export default function TermsPage() {
  return (
    <ProductInfoPage
      eyebrow="TERMS · DRAFT"
      title="服务条款草案"
      introduction="本草案用于说明产品预期规则，正式公开运营前必须由适用司法辖区的专业人士审阅。"
      draft
      sections={[
        { id: "scope", title: "服务范围", content: <p>故事情感地图提供地点故事、时间线、故事线路、群组、协作、媒体和数据导出工具。测试功能、容量和可用性可能在提前说明后调整。</p> },
        { id: "account", title: "账号责任", content: <p>用户应妥善保管登录凭据，不冒用他人身份，不通过自动化手段干扰服务。发现异常访问时应及时重置密码并退出其他设备。</p> },
        { id: "content", title: "用户内容", content: <p>用户应确保有权提交相关文字与图片。内容所有权、平台展示许可范围、授权期限和终止后的处理方式仍需法律审阅后确定。</p> },
        { id: "moderation", title: "内容治理", content: <p>明显违法、侵犯隐私、骚扰、侵权或破坏服务安全的内容可能被限制展示。治理决定应保留审计记录，并预留申诉与复核机制。</p> },
        { id: "availability", title: "服务变更与可用性", content: <p>维护、故障或不可抗力可能造成暂时不可用。本草案不承诺历史 SLA；正式服务等级、责任限制和争议解决条款需要法律审阅。</p> },
        { id: "review", title: "待法律确认", content: <p>需重点确认：适用法律与管辖、年龄限制、内容许可、侵权通知流程、付费与退款、责任限制、终止与申诉、消费者权益以及条款更新通知方式。</p> },
      ]}
    />
  );
}

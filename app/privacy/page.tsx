import type { Metadata } from "next";
import { ProductInfoPage } from "@/components/product/product-info-page";

export const metadata: Metadata = {
  title: "隐私说明草案",
  description: "故事情感地图隐私说明草案，待正式法律审阅。",
};

export default function PrivacyPage() {
  return (
    <ProductInfoPage
      eyebrow="PRIVACY · DRAFT"
      title="隐私说明草案"
      introduction="这份草案说明当前产品的数据处理边界，不替代正式隐私政策或法定告知。"
      draft
      sections={[
        { id: "data", title: "处理的数据", content: <p>产品处理账号资料、用户主动创建的故事与地点、协作和群组关系、媒体文件、通知偏好、举报与反馈、必要的安全日志和不含故事正文的产品事件。</p> },
        { id: "location", title: "地点与媒体", content: <p>经纬度可能具有高度敏感性。产品不会在初始化时强制申请浏览器定位；图片处理默认移除 EXIF 等设备和 GPS 元数据。私密媒体通过受控短期地址读取。</p> },
        { id: "visibility", title: "可见范围", content: <p>公开 Story 可被匿名访客读取；私密 Story 仅创建者及符合条件的已接受共同经历者可读；群组 Story 还要求有效群组成员身份。未解锁时间胶囊和草稿不会进入公共发现。</p> },
        { id: "analytics", title: "分析与安全", content: <p>产品事件不记录故事正文、私密标题、经纬度原值、密码、令牌或邮件正文。安全限流只保存经过 HMAC 处理的标识摘要。</p> },
        { id: "control", title: "用户控制", content: <p>用户可以修改公开资料、导出自己拥有的数据并发起账号删除。协作内容、公开内容保留选择、治理日志和备份中的删除时限需要在正式政策中进一步说明。</p> },
        { id: "review", title: "待法律确认", content: <p>需重点确认：数据控制者身份与联系渠道、处理目的和法律基础、未成年人政策、跨境传输、供应商清单、Cookies、保留期限、数据主体权利响应流程及监管投诉渠道。</p> },
      ]}
    />
  );
}

import type { Metadata } from "next";
import { ProductInfoPage } from "@/components/product/product-info-page";

export const metadata: Metadata = {
  title: "社区规范草案",
  description: "故事情感地图社区规范草案，待正式法律和治理审阅。",
};

export default function CommunityGuidelinesPage() {
  return (
    <ProductInfoPage
      eyebrow="COMMUNITY · DRAFT"
      title="社区规范草案"
      introduction="真实地点承载真实的人。分享故事时，请同时保护自己和他人的安全与尊严。"
      draft
      sections={[
        { id: "respect", title: "尊重他人", content: <p>不得发布骚扰、仇恨、威胁、跟踪或以羞辱他人为目的的内容。讲述共同经历时，应考虑其中人物是否可能被识别或受到伤害。</p> },
        { id: "privacy", title: "保护隐私", content: <p>不要公开他人的家庭住址、实时位置、联系方式、证件、医疗或其他敏感信息。涉及敏感地点时，应降低坐标精度或使用更严格的可见范围。</p> },
        { id: "rights", title: "尊重创作与权利", content: <p>只上传有权使用的文字和图片。引用作品时保持必要限度并注明来源；侵权通知与反通知程序需要在正式上线前由法律审阅。</p> },
        { id: "integrity", title: "保持真实和可辨识", content: <p>不要冒充他人、批量发布垃圾内容或故意传播会造成现实伤害的虚假信息。虚构世界和文学地图应让读者能够理解其创作属性。</p> },
        { id: "report", title: "举报与处理", content: <p>可通过内容旁的“举报”提交治理问题，也可使用页面右下角“反馈”报告产品问题。举报者身份不会向被举报对象公开。</p> },
        { id: "review", title: "待治理与法律确认", content: <p>需进一步确定：严重违规分级、紧急风险响应、申诉时限、透明度报告、版权流程、未成年人保护以及执法请求处理规范。</p> },
      ]}
    />
  );
}

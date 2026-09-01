import Link from "next/link";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/navigation/app-header";

type ProductInfoSection = {
  id: string;
  title: string;
  content: ReactNode;
};

export function ProductInfoPage({
  eyebrow,
  title,
  introduction,
  draft = false,
  sections,
}: {
  eyebrow: string;
  title: string;
  introduction: string;
  draft?: boolean;
  sections: ProductInfoSection[];
}) {
  return (
    <main className="content-page product-info-page">
      <AppHeader />
      <div className="content-container content-container--narrow">
        <div className="page-heading product-info-heading">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p>{introduction}</p>
          </div>
        </div>
        {draft ? (
          <div className="legal-draft-notice" role="note">
            <strong>Draft / 待法律审阅</strong>
            <p>这是用于产品测试和讨论的说明草案，不构成最终法律文本。</p>
          </div>
        ) : null}
        <nav className="product-info-toc" aria-label={`${title}目录`}>
          {sections.map((section) => (
            <a key={section.id} href={`#${section.id}`}>{section.title}</a>
          ))}
        </nav>
        <div className="product-info-sections">
          {sections.map((section) => (
            <section id={section.id} className="content-section" key={section.id}>
              <h2>{section.title}</h2>
              {section.content}
            </section>
          ))}
        </div>
        <footer className="product-info-footer">
          <Link href="/help">帮助中心</Link>
          <Link href="/terms">服务条款草案</Link>
          <Link href="/privacy">隐私说明草案</Link>
          <Link href="/community-guidelines">社区规范草案</Link>
          <Link href="/status">服务状态</Link>
        </footer>
      </div>
    </main>
  );
}

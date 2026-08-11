import Link from "next/link";

export default async function AccountDeletedPage({
  searchParams,
}: {
  searchParams: Promise<{ pending?: string }>;
}) {
  const pending = (await searchParams).pending === "1";
  return (
    <main className="auth-page">
      <section className="auth-card account-deleted-card">
        <p className="eyebrow">ACCOUNT CLOSED</p>
        <h1>{pending ? "账号已停用" : "账号已删除"}</h1>
        <p>{pending ? "你的登录身份已经停用，但应用数据清理仍需维护者继续处理。" : "你已经退出登录。按照你的选择，应用数据已删除或匿名化保留。"}</p>
        <Link className="primary-button nav-link" href="/">返回故事地图</Link>
      </section>
    </main>
  );
}

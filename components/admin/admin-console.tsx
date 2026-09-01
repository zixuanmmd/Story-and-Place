"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/navigation/app-header";
import { useAuth } from "@/components/providers/auth-provider";
import {
  getAdminDashboard,
  getAdminProductAnalytics,
  listAdminAuditLogs,
  listAdminContent,
  listAdminReports,
  listAdminUsers,
  moderateContent,
  reviewReport,
  setAccountRestriction,
  setEntryFeatured,
} from "@/lib/data/admin";
import { getFriendlyError } from "@/lib/errors";
import type {
  AdminAudit,
  AdminContent,
  AdminDashboard,
  AdminProductAnalytics,
  AdminReport,
  AdminUser,
} from "@/lib/validation/admin";
import type { ReportStatus } from "@/types/database";

type AdminTab = "overview" | "analytics" | "reports" | "content" | "users" | "audit";

const REASON_LABELS: Record<string, string> = {
  spam: "垃圾内容",
  harassment: "骚扰",
  hate: "仇恨或攻击",
  privacy: "侵犯隐私",
  misinformation: "虚假信息",
  copyright: "侵权",
  inappropriate: "不适当内容",
  other: "其他",
};

export function AdminConsole() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [analytics, setAnalytics] = useState<AdminProductAnalytics | null>(null);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [reportStatus, setReportStatus] = useState<ReportStatus | null>(null);
  const [reportHasMore, setReportHasMore] = useState(false);
  const [content, setContent] = useState<AdminContent[]>([]);
  const [contentHasMore, setContentHasMore] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userHasMore, setUserHasMore] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [appliedUserQuery, setAppliedUserQuery] = useState("");
  const [audit, setAudit] = useState<AdminAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (authLoading || !user) return;
    setLoading(true);
    setStatus(null);
    try {
      const [nextDashboard, nextAnalytics, nextReports, nextContent, nextUsers, nextAudit] = await Promise.all([
        getAdminDashboard(),
        getAdminProductAnalytics(30),
        listAdminReports(reportStatus),
        listAdminContent(),
        listAdminUsers(appliedUserQuery),
        listAdminAuditLogs(),
      ]);
      setDashboard(nextDashboard);
      setAnalytics(nextAnalytics);
      setReports(nextReports.items);
      setReportHasMore(nextReports.has_more);
      setContent(nextContent.items);
      setContentHasMore(nextContent.has_more);
      setUsers(nextUsers.items);
      setUserHasMore(nextUsers.has_more);
      setAudit(nextAudit);
    } catch (error) {
      setStatus(getFriendlyError(error, "管理数据加载失败，请确认治理与产品分析 migration 已执行。"));
    } finally {
      setLoading(false);
    }
  }, [appliedUserQuery, authLoading, reportStatus, user]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const runAction = async (key: string, action: () => Promise<void>, success: string) => {
    setBusyId(key);
    setStatus(null);
    try {
      await action();
      setStatus(success);
      await load();
    } catch (error) {
      setStatus(getFriendlyError(error, "管理操作失败，请稍后重试。"));
    } finally {
      setBusyId(null);
    }
  };

  const askReason = (message: string) => window.prompt(message, "")?.trim() ?? null;

  const loadMoreReports = async () => {
    setBusyId("reports-more");
    try {
      const page = await listAdminReports(reportStatus, reports.length);
      setReports((current) => [...current, ...page.items]);
      setReportHasMore(page.has_more);
    } catch (error) {
      setStatus(getFriendlyError(error, "更多举报加载失败。"));
    } finally {
      setBusyId(null);
    }
  };

  const loadMoreContent = async () => {
    setBusyId("content-more");
    try {
      const page = await listAdminContent(null, content.length);
      setContent((current) => [...current, ...page.items]);
      setContentHasMore(page.has_more);
    } catch (error) {
      setStatus(getFriendlyError(error, "更多内容加载失败。"));
    } finally {
      setBusyId(null);
    }
  };

  const loadMoreUsers = async () => {
    setBusyId("users-more");
    try {
      const page = await listAdminUsers(appliedUserQuery, users.length);
      setUsers((current) => [...current, ...page.items]);
      setUserHasMore(page.has_more);
    } catch (error) {
      setStatus(getFriendlyError(error, "更多用户加载失败。"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="content-page admin-page">
      <AppHeader />
      <div className="content-container admin-container">
        <header className="admin-hero">
          <div>
            <p className="eyebrow">COMMUNITY OPERATIONS</p>
            <h1>运营与内容治理</h1>
            <p>仅展示审核所需的公开资料和统计，不在后台聚合私密正文。</p>
          </div>
          <Link className="secondary-button nav-link" href="/">返回地图</Link>
        </header>

        <nav className="admin-tabs" aria-label="管理模块">
          {([
            ["overview", "概览"], ["analytics", "产品指标"], ["reports", "举报"], ["content", "公开内容"],
            ["users", "用户"], ["audit", "审计日志"],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>
          ))}
        </nav>

        {status ? <div className="inline-notice" role="status">{status} <button className="quiet-button" type="button" disabled={loading} onClick={() => void load()}>重新读取</button></div> : null}
        {loading ? <div className="content-state" role="status">正在读取管理数据…</div> : null}

        {!loading && tab === "overview" && dashboard ? (
          <section className="admin-metric-grid" aria-label="运营概览">
            {[
              ["用户总数", dashboard.total_users], ["近 7 日注册", dashboard.recent_users_7d],
              ["近 30 日活跃", dashboard.active_users_30d], ["受限账号", dashboard.restricted_users],
              ["故事总数", dashboard.total_entries], ["公开故事", dashboard.public_entries],
              ["私密故事", dashboard.private_entries], ["群组故事", dashboard.group_entries],
              ["受限故事", dashboard.moderated_entries], ["故事路线", dashboard.story_routes],
              ["群组", dashboard.groups], ["待处理举报", dashboard.pending_reports],
            ].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}
          </section>
        ) : null}

        {!loading && tab === "analytics" && analytics ? (
          <section className="admin-section" aria-labelledby="product-analytics-title">
            <div className="admin-section-title">
              <div><p className="eyebrow">PRODUCT ANALYTICS</p><h2 id="product-analytics-title">最近 30 天产品指标</h2></div>
              <p>按匿名浏览会话与站内用户聚合，不采集故事正文、搜索词或坐标。</p>
            </div>

            <div className="admin-metric-grid">
              {[
                ["注册用户", analytics.acquisition.signups],
                ["有行为的登录用户", analytics.acquisition.tracked_active_users],
                ["Onboarding 完成率", `${analytics.activation.onboarding_rate}%`],
                ["首个故事创建率", `${analytics.activation.first_story_rate}%`],
                ["第二个故事创建率", `${analytics.activation.second_story_rate}%`],
                ["人均新故事", analytics.engagement.stories_per_creator],
                ["路线使用率", `${analytics.engagement.route_adoption_rate}%`],
                ["搜索访客", analytics.engagement.search_visitors],
                ["探索访客", analytics.engagement.explore_visitors],
              ].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}
            </div>

            <div className="admin-analytics-grid">
              <article className="admin-card">
                <div><p className="eyebrow">ACTIVATION FUNNEL</p><h3>注册到七日回访</h3></div>
                <ol className="admin-funnel-list">
                  <li><span>注册</span><strong>{analytics.activation_funnel.signup_completed}</strong></li>
                  <li><span>完成引导</span><strong>{analytics.activation_funnel.onboarding_completed}</strong></li>
                  <li><span>创建首个故事</span><strong>{analytics.activation_funnel.first_story_created}</strong></li>
                  <li><span>创建第二个故事</span><strong>{analytics.activation_funnel.second_story_created}</strong></li>
                  <li><span>七日内再次访问</span><strong>{analytics.activation_funnel.returned_within_7d}</strong></li>
                </ol>
              </article>
              <article className="admin-card">
                <div><p className="eyebrow">DISCOVERY FUNNEL</p><h3>探索到注册</h3></div>
                <ol className="admin-funnel-list">
                  <li><span>打开探索</span><strong>{analytics.explore_funnel.explore_opened}</strong></li>
                  <li><span>打开公开故事</span><strong>{analytics.explore_funnel.public_story_opened}</strong></li>
                  <li><span>查看作者主页</span><strong>{analytics.explore_funnel.public_profile_opened}</strong></li>
                  <li><span>随后注册</span><strong>{analytics.explore_funnel.signup_completed}</strong></li>
                </ol>
              </article>
              <article className="admin-card">
                <div><p className="eyebrow">RETENTION</p><h3>留存</h3></div>
                <dl className="admin-retention-list">
                  {([[
                    "d1", "D1",
                  ], [
                    "d7", "D7",
                  ], [
                    "d30", "D30",
                  ]] as const).map(([key, label]) => (
                    <div key={key}><dt>{label}</dt><dd><strong>{analytics.retention[key].rate}%</strong><small>{analytics.retention[key].retained}/{analytics.retention[key].eligible}</small></dd></div>
                  ))}
                </dl>
              </article>
            </div>
            <p className="field-meta">留存以注册时刻后的第 1、7、30 个 24 小时窗口计算；只有已到达对应观察期的用户进入分母。</p>
          </section>
        ) : null}

        {!loading && tab === "reports" ? (
          <section className="admin-section">
            <div className="admin-section-title">
              <h2>举报队列</h2>
              <label><span>状态</span><select value={reportStatus ?? "all"} onChange={(event) => setReportStatus(event.target.value === "all" ? null : event.target.value as ReportStatus)}><option value="all">全部</option><option value="pending">待处理</option><option value="reviewing">审核中</option><option value="resolved">已处理</option><option value="dismissed">已驳回</option></select></label>
            </div>
            <div className="admin-list">
              {reports.map((report) => (
                <article key={report.id} className="admin-card">
                  <div><p className="eyebrow">{REASON_LABELS[report.reason] ?? report.reason} · {report.status}</p><h3>{report.target_label}</h3><p>{report.description || "未填写补充说明。"}</p><small>举报人：{report.reporter_name ?? "已注销用户"} · {new Date(report.created_at).toLocaleString("zh-CN")}</small></div>
                  <div className="record-actions">
                    {report.target_href ? <Link className="quiet-button nav-link" href={report.target_href} target="_blank" rel="noreferrer">打开对象</Link> : null}
                    {report.status === "pending" ? <button type="button" disabled={busyId === report.id} onClick={() => void runAction(report.id, () => reviewReport(report.id, "reviewing", ""), "举报已进入审核。")}>开始审核</button> : null}
                    {report.status !== "resolved" ? <button type="button" disabled={busyId === report.id} onClick={() => { const notes = askReason("处理说明（可留空）"); if (notes !== null) void runAction(report.id, () => reviewReport(report.id, "resolved", notes), "举报已处理。"); }}>标记已处理</button> : null}
                    {report.status !== "dismissed" ? <button type="button" disabled={busyId === report.id} onClick={() => { const notes = askReason("驳回说明（可留空）"); if (notes !== null) void runAction(report.id, () => reviewReport(report.id, "dismissed", notes), "举报已驳回。"); }}>驳回</button> : null}
                  </div>
                </article>
              ))}
              {!reports.length ? <div className="small-empty">当前筛选下没有举报。</div> : null}
            </div>
            {reportHasMore ? <button type="button" disabled={busyId === "reports-more"} onClick={() => void loadMoreReports()}>加载更多</button> : null}
          </section>
        ) : null}

        {!loading && tab === "content" ? (
          <section className="admin-section">
            <div className="admin-section-title"><h2>公开内容治理</h2><p>后台不读取私密或群组内容正文。</p></div>
            <div className="admin-list">
              {content.map((item) => (
                <article key={`${item.kind}:${item.id}`} className="admin-card">
                  <div><p className="eyebrow">{item.kind === "entry" ? "故事" : "路线"} · {item.moderation_status}{item.featured ? " · 已精选" : ""}</p><h3>{item.title}</h3><small>作者：{item.author_name ?? "已注销用户"} · {new Date(item.created_at).toLocaleDateString("zh-CN")}</small></div>
                  <div className="record-actions">
                    <Link className="quiet-button nav-link" href={item.href} target="_blank" rel="noreferrer">查看</Link>
                    {item.kind === "entry" && item.moderation_status === "active" ? <button type="button" disabled={busyId === item.id} aria-pressed={item.featured} onClick={() => void runAction(item.id, () => setEntryFeatured(item.id, !item.featured), item.featured ? "已取消精选。" : "已设为精选。")}>{item.featured ? "取消精选" : "设为精选"}</button> : null}
                    {item.moderation_status === "active" ? <button type="button" disabled={busyId === item.id} onClick={() => { const reason = askReason("限制展示原因"); if (reason) void runAction(item.id, () => moderateContent(item.kind, item.id, "restricted", reason), "内容已限制展示。"); }}>限制展示</button> : <button type="button" disabled={busyId === item.id} onClick={() => void runAction(item.id, () => moderateContent(item.kind, item.id, "active", ""), "内容已恢复展示。")}>恢复</button>}
                    {item.moderation_status !== "removed" ? <button type="button" disabled={busyId === item.id} onClick={() => { const reason = askReason("下架原因"); if (reason) void runAction(item.id, () => moderateContent(item.kind, item.id, "removed", reason), "内容已下架（未物理删除）。"); }}>下架</button> : null}
                  </div>
                </article>
              ))}
            </div>
            {contentHasMore ? <button type="button" disabled={busyId === "content-more"} onClick={() => void loadMoreContent()}>加载更多</button> : null}
          </section>
        ) : null}

        {!loading && tab === "users" ? (
          <section className="admin-section">
            <div className="admin-section-title"><h2>用户管理</h2><form onSubmit={(event) => { event.preventDefault(); setAppliedUserQuery(userQuery.trim()); }}><label><span className="sr-only">搜索用户</span><input value={userQuery} maxLength={80} placeholder="昵称或用户名" onChange={(event) => setUserQuery(event.target.value)} /></label><button type="submit">搜索</button></form></div>
            <div className="admin-list">
              {users.map((account) => (
                <article key={account.id} className="admin-card">
                  <div><p className="eyebrow">{account.is_admin ? "管理员" : account.account_status === "restricted" ? "已限制" : "正常"}</p><h3>{account.display_name}</h3><p>@{account.username} · {account.story_count} 个故事 · {account.route_count} 条路线 · {account.report_count} 次被举报</p><small>注册：{new Date(account.created_at).toLocaleDateString("zh-CN")} · 最近登录：{account.last_sign_in_at ? new Date(account.last_sign_in_at).toLocaleString("zh-CN") : "暂无"}</small></div>
                  <div className="record-actions"><Link className="quiet-button nav-link" href={`/users/${account.username}`} target="_blank" rel="noreferrer">公开主页</Link>{!account.is_admin && (account.account_status === "active" ? <button type="button" disabled={busyId === account.id} onClick={() => { const reason = askReason("限制账号原因"); if (reason) void runAction(account.id, () => setAccountRestriction(account.id, true, reason), "账号已限制。"); }}>限制账号</button> : <button type="button" disabled={busyId === account.id} onClick={() => void runAction(account.id, () => setAccountRestriction(account.id, false, ""), "账号限制已解除。")}>解除限制</button>)}</div>
                </article>
              ))}
            </div>
            {userHasMore ? <button type="button" disabled={busyId === "users-more"} onClick={() => void loadMoreUsers()}>加载更多</button> : null}
          </section>
        ) : null}

        {!loading && tab === "audit" ? (
          <section className="admin-section"><div className="admin-section-title"><h2>治理审计日志</h2><p>只记录动作和必要元数据，不保存私密正文。</p></div><div className="admin-list">{audit.map((log) => <article key={log.id} className="admin-card"><div><p className="eyebrow">{log.action}</p><h3>{log.target_type} · {log.target_id}</h3><small>{log.admin_name ?? "已注销管理员"} · {new Date(log.created_at).toLocaleString("zh-CN")}</small></div></article>)}</div></section>
        ) : null}
      </div>
    </main>
  );
}

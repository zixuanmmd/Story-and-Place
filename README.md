# 故事情感地图

“故事情感地图”是一个以地图为主体的时空记录与基础社交应用。用户可以留下公开、私密或群组故事，创建公开/私密群组，关注作者，并在有权访问的记录下点赞、评论与举报。私密数据和群组内容的最终边界由 Supabase PostgreSQL Row Level Security（RLS）、受限 RPC 和列级权限强制执行。

## 技术栈

- Next.js App Router、React、TypeScript 严格模式
- Tailwind CSS
- Leaflet、react-leaflet、OpenStreetMap
- Supabase Auth、PostgreSQL、RLS
- Zod、React Hook Form、Vitest
- Lucide React（受控地点分类 SVG 图标注册表）

## 本地安装与启动

要求 Node.js 20.9 或更高版本：

```bash
npm install
cp .env.example .env.local
npm run dev
```

浏览器访问 <http://localhost:3000>。生产构建的本地启动方式：

```bash
npm run build
npm start
```

## Supabase 配置与 migration

1. 新建 Supabase 项目，在 Authentication 中启用邮箱认证。
2. 按文件名顺序执行全部 migration：
   - `supabase/migrations/202607220001_initial_schema.sql`
   - `supabase/migrations/202607220002_privacy_time_integrity.sql`
   - `supabase/migrations/202607230001_groups_social_categories.sql`
   - `supabase/migrations/202607240001_unique_display_names_and_schema_refresh.sql`
   - `supabase/migrations/202607250001_timelines_story_routes.sql`
   - `supabase/migrations/202607250002_group_membership_hardening.sql`
   - `supabase/migrations/202607250003_group_creator_select_policy.sql`
   - `supabase/migrations/202607260001_entry_participants_tags.sql`
   - `supabase/migrations/202607300001_entry_rpc_group_membership.sql`
   - `supabase/migrations/202607300002_entry_rls_helper_execute.sql`
   - `supabase/migrations/202608040001_v11_schema_foundation.sql`
   - `supabase/migrations/202608040002_emotion_tags.sql`
   - `supabase/migrations/202608050001_time_capsules.sql`
   - `supabase/migrations/202608050002_life_paths.sql`
   - `supabase/migrations/202608050003_launch_onboarding.sql`
   - `supabase/migrations/202608050004_launch_explore.sql`
   - `supabase/migrations/202608050005_launch_explore_acl_fix.sql`
   - `supabase/migrations/202608050006_launch_explore_keyword_lenses.sql`
   - `supabase/migrations/202608070001_launch_featured_entries.sql`
   - `supabase/migrations/202608080001_v13_global_search.sql`
   - `supabase/migrations/202608080002_v13_entry_drafts.sql`
   - `supabase/migrations/202608080003_v13_data_portability_account_deletion.sql`
   - `supabase/migrations/202608110001_v13_global_search_escape_fix.sql`
   - `supabase/migrations/202608110002_trigger_function_execute_hardening.sql`
   - `supabase/migrations/20260811111243_timeline_participant_acl_fix.sql`
   - `supabase/migrations/202608270001_v14_security_reliability.sql`
   - `supabase/migrations/202608280001_v14_notifications.sql`
   - `supabase/migrations/202608280002_v14_story_media.sql`
   - `supabase/migrations/20260828102358_v14_rate_limit_clock_fix.sql`
   - `supabase/migrations/20260828102558_v14_rate_limit_builtin_fix.sql`
   - `supabase/migrations/202608290001_v14_governance.sql`
   - `supabase/migrations/202608290002_v14_product_analytics.sql`
   - `supabase/migrations/202608290003_v14_commercial_foundation.sql`
   - `supabase/migrations/202608290004_v14_product_completeness.sql`
3. 在开发期按需配置邮箱确认和 `http://localhost:3000` 回调地址。
4. 从项目 API 设置复制 Project URL 与 anon/publishable key。

已安装 Supabase CLI 时可执行：

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

第二份 migration 是向后兼容的时间与写权限升级。第三份 migration 新增群组、成员、邀请、关注、点赞、评论、举报和 12 个稳定地点分类，并把记录可见性扩展为 `group`。第四份 migration 增加昵称规范化唯一索引、可用性 RPC、注册触发器升级和 PostgREST schema cache 刷新。第五份 migration 新增时间线安全查询、故事路线、路线节点、分享权限和自动隐私降级保护。第六、七份 migration 加固群主不变量和群组创建后的读取策略。第八份 migration 新增共同经历邀请、字段级受控编辑、数据库编辑日志、自由标签、权限安全的标签聚合和相应 Realtime publication。第九、十份 migration 加固记录 RPC 的群组资格与辅助函数执行权限。第十一份 migration 增加 v1.1 的标签类型、时间胶囊解锁时间和路线节点关系字段，但不提前开放写权限。第十二份 migration 激活类型化标签聚合和公共情绪故事，并安全提升七个预设情绪标签。第十三份 migration 激活时间胶囊的 owner-only 锁定、受控写入、时间线筛选、信息流保护和路线隐私降级。第十四份 migration 为公开资料增加稳定用户名，并提供只基于“已解锁公开故事”的人生轨迹与聚合查询。第十五份 migration 新增仅本人可读的首次使用偏好、跳过状态与完成 RPC，不把兴趣写入公开 profiles。第十六份 migration 新增公开探索的复合游标查询，只返回已解锁的 `public` 故事，并在数据库分页前按受控标签词表分类；第十七份 migration 修复匿名 Explore 不应依赖内部标签规范化函数的 ACL 问题；第十八份 migration 让受控主题分类识别 `#成都科幻`、`#文学空间` 等复合标签，但仍不扫描正文；第十九份 migration 新增由可信运营端维护的故事精选时间，并提供只返回已解锁公开故事的精选 RPC；第二十份 migration 新增权限安全的全局搜索 RPC 和中英文模糊检索索引，所有故事、路线、标签数量都先经过当前用户权限与时间胶囊解锁检查；第二十一份 migration 新增仅创建者可读的服务端草稿、乐观版本控制及原子发布 RPC；第二十二份 migration 新增权限安全的数据导出、账号删除影响预览、删除请求状态与 service-role-only 数据清理函数；第二十三份 migration 修复全局搜索 LIKE 转义字符在 PostgreSQL 中被解析为两个字符而导致 `22025` 的运行时错误，不改变结果结构或权限语义；第二十四份 migration 撤销两个内部触发器函数对 API 角色的默认执行权，触发器继续正常运行；第二十五份 migration 为匿名时间线查询补齐 `entry_participants` 的表级 `SELECT` ACL，但该表仍启用 RLS 且没有匿名读取策略，因此匿名直接查询始终为零行，参与关系不会公开。第二十六份 migration 新增服务端持久化限流。第二十七份 migration 新增本人专属通知、通知偏好、邮件 outbox、事件触发器与时间胶囊同步 RPC。旧记录不会在 migration 执行时被删除；只有用户完成密码复核并明确确认删除后才会处理其数据。

## 新增页面

- `/groups`、`/groups/new`：群组目录与创建。
- `/groups/[slug]`：群组地图与记录列表。
- `/groups/[slug]/members`、`/groups/[slug]/settings`：成员角色与群组资料管理。
- `/groups/invitations`：接受或拒绝邀请。
- `/feed`：按创建时间倒序的权限安全信息流，每页 20 条。
- `/explore`：匿名可访问的公开故事发现页，按文学、城市记忆、旅行、科幻和虚构世界筛选；私密、群组和未来胶囊不会进入结果。
- `/users/[username]`：用户公开主页、分页公开故事、人生轨迹、关注状态与代表性公开线路；原 UUID 地址继续兼容。公开故事列表、统计和轨迹始终排除私密、群组故事与尚未解锁的时间胶囊。
- `/timeline`：当前用户的个人故事时间线，每页 50 条。
- `/users/[username]/timeline`、`/groups/[slug]/timeline`：公开用户时间线与成员专属群组时间线；用户时间线仍兼容 UUID 地址。
- `/routes`、`/routes/new`：路线列表和路线编辑器。
- `/routes/[shareSlug]`、`/routes/[shareSlug]/edit`：权限安全的路线分享与编辑。
- `/entry-invitations`：接受或拒绝共同经历邀请。
- `/tags`：按照普通、情绪、主题、人物和事件类型浏览当前有权读取的标签。
- `/tags/[slug]`：只聚合当前访问者有权读取的标签记录。
- `/emotions/[emotion]`：按稳定情绪标识浏览公开故事，不返回私密或群组记录。
- `/onboarding`：首次登录欢迎与可跳过的兴趣选择。
- `/search`：统一搜索地点故事、用户、标签、情绪与故事路线，可组合年份、地点、作者与内容类型筛选，并在列表和地图间切换。
- `/entries/[id]`：每条有权读取的故事的稳定独立地址。公开且已解锁故事生成标题、摘要、canonical 和 Open Graph；其他内容的服务端 metadata 始终使用不含故事信息的安全文案。
- `/notifications`：分页读取当前账户自己的站内通知，支持逐条和全部标记为已读。
- `/settings/notifications`：按协作、群组、时间胶囊、安全和产品更新设置接收方式。
- `/settings/usage`：查看 entitlement 驱动的套餐能力和真实资源使用量。
- `/help`：静态帮助中心；解释 Story、Story Route、时间胶囊、隐私、共同经历、群组、导出与账号删除。
- `/terms`、`/privacy`、`/community-guidelines`：明确标记为待法律审阅的产品草案。
- `/status`：只展示 Web App、Database 与 Media 的当前健康状态。

权限选择界面使用面向用户的阅读范围描述，而不是数据库枚举：地点故事区分“我和受邀共同经历者”“所属群组成员”“所有人”；故事路线区分“只有我”“所属群组成员”“所有人”；群组创建则说明“任何人都能发现”或“仅受邀的人”。这些文案不会改变底层 `private`、`group`、`public` 值与既有 RLS，数据库仍是最终权限边界。
- `/onboarding/complete`：第一个故事完成反馈和下一步入口。
- 创建地点时可选“人生记忆、旅行记录、文学地图、虚构世界”四种前端故事模板；模板只提供写作线索、建议分类、时间精度与普通标签，不会改写已经填写的内容，也不会新增数据库字段。

## 环境变量

`.env.local`：

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
# 旧 Supabase 项目也可以改用：NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
NEXT_PUBLIC_APP_VERSION=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION=true
# 仅服务端：账号删除、持久化限流和后续受控运维接口。
SUPABASE_SERVICE_ROLE_KEY=
# 仅服务端：至少 32 字节随机值，用于 HMAC 匿名化限流标识符。
RATE_LIMIT_SECRET=
```

Publishable key 与 legacy anon key 二选一即可；项目优先读取 publishable key。不要提交 `.env.local`，也不要在浏览器端加入 Supabase `service_role` key。`NEXT_PUBLIC_SITE_URL` 部署后应改为正式站点 origin。

变量按暴露范围划分：

- Public / required：`NEXT_PUBLIC_SUPABASE_URL`、一个浏览器可用 key、`NEXT_PUBLIC_SITE_URL`。
- Public / optional：`NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION`，缺失时安全默认值为 `true`。
- Server-only / required for protected operations：`SUPABASE_SERVICE_ROLE_KEY`、`RATE_LIMIT_SECRET`、`MEDIA_CLEANUP_SECRET`、`CRON_SECRET`。这些变量都不得使用 `NEXT_PUBLIC_` 前缀；Development、Preview、Production 应使用不同值，媒体清理、Cron 与限流密钥还应彼此独立。
- Platform-provided：`VERCEL_GIT_COMMIT_SHA` 仅用于健康检查显示短版本号，不由应用保存。

生成限流密钥时使用密码管理器或系统安全随机源，不要与 Supabase key、用户密码或 JWT secret 复用。新增服务端变量后需要重新部署相应环境，不能依赖旧实例自动读取。

## 测试环境免邮箱验证

临时、小范围测试时，可以让新用户注册后直接得到 Supabase session，无需打开邮箱。这个能力必须同时配置 Supabase 服务端和本地前端预期：

1. 打开 Supabase Dashboard。
2. 进入 `Authentication → Sign In / Providers → Email`；部分界面显示为 `Authentication → Providers → Email`。
3. 开启 Email Provider。
4. 开启 `Allow new users to sign up`。
5. 关闭 `Confirm Email`。Supabase 当前文档将它放在 Email Provider 的 provider-specific configuration 中。
6. 在 `.env.local` 中设置：

   ```dotenv
   NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION=false
   ```

7. 重启开发服务器。
8. 使用一个新的测试邮箱和未占用昵称注册，确认注册后直接回到原本准备访问的站内页面，导航栏显示用户名称，刷新页面后登录状态仍然存在。

前端环境变量不能关闭 Supabase 的邮箱确认，必须同时修改 Supabase Dashboard 配置。环境变量只控制前端预期、页面提示和配置不一致时的错误说明；真正的邮箱确认行为始终由 Supabase Auth 决定。变量缺失或任何非 `false` 值都会采用安全默认值 `true`。

该设置只适合临时、小范围测试。正式公开测试或生产环境应重新开启 `Confirm Email`，把 `NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION` 设为 `true` 或删除，并配置自定义 SMTP，避免依赖 Supabase 默认邮件发送额度。

关闭确认开关不会保证已有的未确认账户自动变为已确认，也不要为此自动删除现有用户。旧测试账户仍无法登录时，应在 Supabase Dashboard 中人工检查该账户的确认状态，或换一个新的测试邮箱重新注册。

已经注册的邮箱应直接登录，不要再次注册。测试模式下 Supabase 通常返回 `email_exists`、`user_already_exists` 或 `User already registered`；页面会保留邮箱、清空密码并显示“前往登录”。如果 Supabase 为防止邮箱枚举返回没有有效 email identity 的模糊用户对象，页面只提示“这个邮箱可能已经注册过”，不会查询 `auth.users` 或 public profiles 来推断邮箱。

## 账号安全与 Auth Dashboard 配置

登录页提供密码找回，邮件回调进入 `/reset-password` 后由 Supabase 建立恢复会话并更新密码。找回页面无论邮箱是否存在都显示相同结果，避免账户枚举。设置页只展示当前会话能够可靠取得的信息，并支持撤销其他设备的刷新会话；Supabase 当前未提供可信的设备名称列表，所以页面不会伪造设备型号或位置。其他设备已经签发的短期 access token 仍会在自身过期时才完全失效。

正式上线前在 Supabase Dashboard 人工复核以下 Auth 设置；这些配置不能由 SQL migration 安全替代：

1. 开启 Email Provider 和正式环境 `Confirm Email`，配置自定义 SMTP 与正确的 Site URL/Redirect URLs（包含 `/reset-password`）。
2. 在套餐支持时开启 Leaked Password Protection；当前 Free 项目无法启用时必须作为上线风险保留。
3. 检查登录、注册、密码重置和邮件发送 rate limits，并为公开入口启用 CAPTCHA/bot protection。
4. 缩短不必要的 session 生命周期，确认 refresh token reuse detection，并定期轮换服务端 secret。
5. 使用新账户实际验证注册、确认、登录、重置密码、刷新会话与退出其他设备。

应用无法拦截绕过页面后直接请求 Supabase Auth 的流量，因此登录、注册和密码重置的最终暴力破解保护必须由 Supabase Auth rate limit/CAPTCHA 承担。不要把前端按钮冷却描述为安全限流。

## 昵称唯一性

昵称由数据库执行最终唯一约束。比较规则是：

- 去除首尾空白；
- 连续空白折叠为一个普通空格；
- 英文字母按大小写不敏感比较；
- 中文原文保持显示；
- 规范化后必须为 1 至 80 个字符。

因此 `山音`、` 山音 ` 视为同一昵称，`Zixuan`、`zixuan` 也视为同一昵称。注册页和设置页会先调用只返回 boolean 的 `is_display_name_available(candidate)`，但最终仍由 `profiles_display_name_normalized_uidx` 防止并发重复。

第四份 migration 会先整理历史数据：每个冲突组中最早创建的账户保留原昵称，后续账户增加稳定的“序号＋UUID 前 6 位”后缀；不会删除账户。执行后可验证规范化昵称没有重复：

```sql
select public.normalize_display_name(display_name), count(*)
from public.profiles
group by public.normalize_display_name(display_name)
having count(*) > 1;
```

结果应为 0 行。可用下面的查询查看可能由兼容迁移增加后缀的昵称：

```sql
select id, display_name, created_at
from public.profiles
where display_name ~ '-[0-9]+-[0-9a-f]{6}(-[0-9]+)?$'
order by created_at, id;
```

## 当前测试项目数据库初始化

本地环境指向 Supabase project ref `bmzsabgzzrwekghdceyj`。2026-07-30 已确认远程 migration 历史与仓库同步至 `202607260001_entry_participants_tags.sql`。发布本次修复前，只需继续应用：

1. `supabase/migrations/202607300001_entry_rpc_group_membership.sql`

不要在远程项目执行 `supabase db reset`，也不要重复手工回放已经执行的旧 migration。执行后可验证：

```sql
select
  to_regclass('public.groups') as groups_table,
  to_regclass('public.group_members') as members_table,
  to_regclass('public.group_invitations') as invitations_table;

select public.is_display_name_available('一个尚未使用的测试昵称');

select
  to_regclass('public.story_routes') as routes_table,
  to_regclass('public.story_route_items') as route_items_table,
  to_regprocedure(
    'public.get_timeline_entries(text,uuid,text,text,text[],uuid,text,integer,integer,boolean,integer,integer)'
  ) as timeline_rpc,
  to_regprocedure('public.ensure_group_has_active_owner()') as owner_guard;
```

群组目录不会把查询错误转换成空数组：加载失败时只显示错误和重试按钮；只有所有查询真实成功且结果为空时才显示空状态。

## 常用检查命令

```bash
npm test
npm run lint
npm run build
npm audit
npm audit --omit=dev
npm outdated
```

从本地 Supabase 生成数据库类型快照：

```bash
supabase gen types typescript --local > types/database.generated.ts
```

生成后应对照 migration 更新/替换 `types/database.ts`，并在 CI 中检查差异，防止手写类型长期漂移。

## 隐私状态隔离

前端数据状态按认证作用域保存：未登录为 `anon`，登录为当前 `user.id`。只有状态作用域与当前身份完全一致时，记录才会参与渲染；身份切换会用 React `key` 同步卸载地图详情、编辑器和删除目标。

查询还携带身份快照和单调请求序号。A 的旧请求即使晚于 B 返回，也会被拒绝写入。退出时先清空本地 session 视图，因此匿名重新查询失败也不会恢复 A 的私密记录。这只是防止客户端残留；数据库 RLS 仍是不可绕过的最终边界。

## 时间字段语义

`map_entries` 同时保存：

- `time_precision`：`exact`、`date`、`month`、`year`、`approximate`。
- `time_label`：用户可直接阅读的原始时间表达。
- `occurred_local`：`timestamp without time zone`，仅表示用户填写的事件当地墙上时间，不按查看者时区转换。
- `occurred_timezone`：可选 IANA 时区，例如 `Asia/Shanghai`；空值表示未知。
- `occurred_at`：旧版精确记录的兼容 UTC 字段。新版客户端不在时区语义不充分时生成它。
- `occurred_date`、`occurred_year`：用于筛选的派生字段；数据库触发器按时间精度规范化。

精确时间使用逐字段日历校验，拒绝不存在的日期、非闰年 2 月 29 日、24 点及非法分钟。编辑优先读取 `occurred_local`；旧数据只在现有 `time_label` 符合本项目旧格式时无损恢复，不根据查看者当前时区猜测。日期筛选优先采用事件当地日期。

## 故事时间线

时间线通过 `get_timeline_entries` 由数据库完成作用域、RLS、筛选、稳定排序和每页 50 条的分页，浏览器不会先取回无权内容再隐藏。排序优先使用 `occurred_year`、`occurred_date` 和 `occurred_local`；仅当“大致时间”的显示文本包含边界清楚的四位年份时才参与对应年份分组。无法可靠判断年份的记录独立放在“时间未定”，不会被伪造成 1 月 1 日。

- `/timeline` 只对登录用户开放，读取自己的记录和已接受的共同经历；群组记录仍要求有效成员资格。
- `/users/[id]/timeline` 永远只查询该用户的公开记录。
- `/groups/[slug]/timeline` 只对当前有效成员开放，只查询该群组的 `group` 记录。
- 地图标记与时间线卡片双向选中；筛选参数经过白名单和 Zod 校验。
- 退出登录由认证作用域 `key` 立即卸载全部状态；成员退出/被移除时 Realtime 会立即清除对应群组节点。

## 情绪标签

现有自由标签继续保持 `normal` 类型。v1.1 额外支持 `emotion`、`theme`、`character` 和 `event`，并预置“孤独、重逢、成长、遗憾、失去、希望、恐惧”七个情绪标签。用户仍通过原有记录表单添加标签；输入开头的 `#` 只用于显示，不会重复保存到标签名称中。

`/tags` 的数量只统计当前访问者有权读取的记录。`/emotions/[emotion]` 使用独立 RPC，并在数据库查询中强制 `visibility = 'public'`；即使登录用户拥有私密记录或群组记录，这些内容也不会进入公共情绪页面或计数。预设情绪使用稳定的 ASCII `semantic_key` 作为地址，原标签 UUID、随机 slug 和已有记录关系保持不变。

## 时间胶囊

记录可选填写 `unlock_at` 作为绝对解锁时刻。解锁前，公开或私密胶囊只有创建者可以读取；群组胶囊还要求创建者保持有效群组成员身份。accepted 共同经历者、关注者、普通群组成员、匿名访问者、标签聚合、点赞评论和 security-definer 信息流都不能绕过锁定。到达解锁时刻后无需后台任务，下一次数据库查询会自动恢复记录原本的 `public`、`private` 或 `group` 可见性。

解锁时间只能由创建者通过 `create_entry_v11`、`update_entry_v11` 受控 RPC 写入；普通客户端没有 `unlock_at` 列权限。新的解锁时间必须晚于当前时刻，已经解锁的旧胶囊可以继续编辑其他内容或清除胶囊状态。时间线提供“已发生（已解锁）／当前（普通故事）／未来（待解锁）”筛选。

未解锁节点只能进入创建者自己的私密故事路线。记录被重新设为未来胶囊时，包含它的公开或群组路线会自动降为私密，避免通过路线标题、节点数或分享地址推断尚未解锁的地点。

## 人生轨迹

用户公开主页使用 `profiles.username` 作为稳定地址，并继续接受历史 UUID 链接。迁移会优先把符合安全句柄格式的英文显示名转成小写连字符用户名；其他旧账户使用稳定的 `traveler-<UUID>`。新注册账户由数据库注册触发器生成 `traveler-<UUID>`，普通浏览器客户端没有修改 username 列的权限。

人生轨迹不创建内容副本，也不把私密记录先取回浏览器再隐藏。`get_public_life_path_entries` 和 `get_public_life_path_summary` 在数据库中显式要求 `visibility = 'public'`、`unlock_at` 已到达，并再次调用标准记录读取权限。匿名用户、普通登录用户、作者本人看到的公开人生轨迹边界完全相同：私密记录、群组记录和未来时间胶囊都不参与故事数、时间跨度、地点数或地图连线。

地图按事件当地时间从早到晚连接最多 200 个公开地点，重叠坐标会进行轻微视觉偏移，跨国际日期变更线会拆分线段。主页的代表性故事线路继续复用已发布、未归档的公开 Story Routes，不复制路线或节点数据。

## 首次使用引导

零故事且没有体验偏好记录的登录用户会进入三步流程：选择可跳过的记录方向、在地图上选择地点并完成精简表单、查看第一个故事完成反馈。已有自己故事的老用户会被标记为已跳过，不会在升级后被强制重新引导。带有记录详情、群组、草稿恢复等明确目标的安全站内链接优先执行，不会被 Onboarding 覆盖。

兴趣和完成状态保存在 `user_experience_preferences`，该表不对匿名用户开放，登录用户也只能读取自己的行。写入和完成通过 security-definer RPC；完成 RPC 会验证第一个故事确实由 `auth.uid()` 创建。首次表单继续调用现有 `create_entry_v11`，默认使用最保守的私密范围，不改变 map_entries 结构或既有权限模型。

当前数据库没有图片、独立引用或人物文本字段，因此首次表单不会展示无法保存的假功能；标签和情绪可以在折叠区域中补充，共同经历者在创建完成后通过原有邀请流程添加。

## 故事路线、连线与分享权限

“故事路线”是独立实体，不修改原始地图记录。`story_route_items` 只保存 `entry_id`、位置和最多 500 字的路线注记，不复制标题、正文、地点或坐标。路线草稿允许 1 个节点，发布至少 2 个，最多 200 个；保存、重排和归档通过受限 RPC 原子执行，普通客户端没有路线节点表的直接写权限。

| 路线可见性 | 可用节点 | 可读者 |
| --- | --- | --- |
| public | 作者自己的公开记录 | 匿名用户和登录用户 |
| private | 作者自己的可见记录，或作者当前有权读取的群组记录 | 仅路线作者；群组资格失效后对应节点不可见 |
| group | 同一群组的群组记录，及作者自己的公开记录 | 当前有效群组成员 |

数据库读取路线节点时会同时检查“路线是否可读”和“原始记录当前是否可读”。公开路线中的公开记录一旦改为私密或群组，触发器立即把包含它的公开路线降为私密并记录 `privacy_downgraded_at`。原记录被删除时节点通过外键安全移除；剩余节点不足 2 个时路线自动撤回发布。群组资格或记录权限变化导致的不可用节点只显示数量提示，不返回标题、正文或坐标。

路线地图使用项目内受控 SVG 分类图标、编号、可见性外形和虚线连线；跨国际日期变更线的线段会在 ±180° 拆开，相同坐标使用确定性的轻微视觉偏移。分享地址优先使用 `NEXT_PUBLIC_SITE_URL`；若部署时仍误留为 localhost，浏览器会改用当前页面 origin，Vercel 元数据也会回退到实际部署域名。分享优先使用 Web Share API，失败时回退到剪贴板。公开路线可以生成标题和说明预览；群组或私密路线的服务端元数据统一使用安全通用文案。

## RLS 与客户端写权限

`map_entries`：

- `SELECT`：任何人可读公开记录；作者可读自己的全部记录；accepted 共同经历者可读对应私密记录；有效群组成员可读对应群组记录。
- `INSERT`：只允许登录用户，且 `user_id = auth.uid()`。
- `UPDATE`、`DELETE`：只允许作者本人。
- `group` 记录必须关联一个未归档群组，作者必须是有效成员；其他可见性不允许残留 `group_id`。
- 客户端不能写 `id`、`created_at`、`updated_at`、`occurred_at`；记录创建后也不能修改 `user_id`。
- 列级 `GRANT` 与不可变字段触发器构成双层保护；时间触发器维护可推导字段并验证 IANA 时区。
- 共同经历者只能通过 `update_entry` RPC 修改明确授权的逻辑字段，不能修改可见性、`group_id`、评论设置或删除记录；每次实际变化由数据库触发器写入不可直接修改的 `entry_edit_logs`。

`profiles` 被明确限定为公开资料表，只允许显示名、头像 URL、简介和审计时间。严禁未来直接加入邮箱、账单、封禁原因或其他私密账户字段；这些字段必须进入单独的、默认不公开且配置独立 RLS 的表。

群组角色矩阵：

| 操作 | owner | admin | member |
| --- | --- | --- | --- |
| 查看与发布群组记录 | 是 | 是 | 是 |
| 邀请成员、移除普通成员 | 是 | 是 | 否 |
| 修改名称、简介、头像 | 是 | 是 | 否 |
| 修改 slug、公开性、成员角色 | 是 | 否 | 否 |
| 转移群主、归档群组 | 是 | 否 | 否 |
| 主动退出 | 转移后 | 是 | 是 |

记录可见性矩阵：

| 可见性 | 匿名 | 作者 | accepted 共同经历者 | 其他登录用户 | 有效群组成员 |
| --- | --- | --- | --- | --- | --- |
| public | 可读 | 可读 | 可读 | 可读 | 可读 |
| private | 不可读 | 可读 | 可读 | 不可读 | 不因成员身份授权 |
| group | 不可读 | 需有效成员资格 | 还需有效成员资格 | 不可读 | 可读 |

群组成员、角色、邀请响应、群主转移、评论软删除和群组评论管理都通过受限 RPC 变更。权限辅助函数使用 `security definer`、空 `search_path` 和完整 schema 名，避免 `group_members` RLS 自递归；客户端没有成员表的直接写权限。关注关系永不授予私密或群组记录权限。点赞、评论及其聚合只能随可见记录读取，成员失效后关联社交信息也不可见。

`group_members`、`map_entries`、`entry_participants`、`entry_tags` 和 `entry_edit_logs` 被加入 Supabase Realtime publication。地图、时间线、路线、群组详情、我的记录、信息流、邀请和标签页面收到可见变更后重新执行权限查询；成员退出、参与权限撤销后会清除已经失权的本地内容。账户切换仍通过身份 `key` 整体卸载旧作用域。

## RLS 集成验证

`supabase/tests/rls_assertions.sql` 会在事务中创建测试账户和数据，并实际断言匿名读取、A/B 私密隔离、跨用户更新/删除、伪造作者以及修改数据库维护字段均成功或失败，最后回滚：

```bash
supabase db reset
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/rls_assertions.sql
```

`supabase/tests/groups_social_rls_assertions.sql` 使用 A/B/C 三个测试身份，断言群组加入/退出、私密邀请、成员移除后的即时失权、角色升级、群主保护、归档写入阻止、私密记录不因关注泄露、点赞/评论权限及举报隔离：

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/groups_social_rls_assertions.sql
```

该脚本还会断言群主重复调用公开群组加入 RPC 后仍保持 owner。第六份 migration 的延迟约束会在事务结束前拒绝任何让群组失去最后一个有效 owner 的写入。

`supabase/tests/display_name_uniqueness_assertions.sql` 断言注册触发器规范化昵称、本人可保留原昵称，以及数据库表达式唯一索引阻止大小写和空白变体：

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/display_name_uniqueness_assertions.sql
```

`supabase/tests/story_routes_rls_assertions.sql` 检查路线表、RLS、受限 RPC 和“客户端不得直接写路线节点”的权限契约：

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/story_routes_rls_assertions.sql
```

`supabase/tests/entry_collaboration_rls_assertions.sql` 断言 pending 参与者不能读取私密事件、accepted 后才可读取和按字段编辑、参与者不能改变访问设置或删除、群组邀请要求有效成员、审计日志由数据库生成，以及标签聚合不会泄露私密关联：

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/entry_collaboration_rls_assertions.sql
```

`supabase/tests/emotion_tags_rls_assertions.sql` 分别以匿名用户、无关登录用户、事件所有者和 accepted 共同经历者身份断言：类型化标签数量只统计可读记录，而公共情绪页始终只返回 `public` 记录：

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/emotion_tags_rls_assertions.sql
```

`supabase/tests/time_capsules_rls_assertions.sql` 断言未来胶囊只对创建者可读，accepted 共同经历者不能提前读取或编辑，关注信息流、标签、情绪页和公共路线均不泄露；测试把解锁时间推进到过去后，再断言原可见性和共同编辑权限自动恢复：

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/time_capsules_rls_assertions.sql
```

`supabase/tests/life_paths_rls_assertions.sql` 以匿名用户、作者和普通登录用户身份断言：公开人生轨迹与统计只包含已解锁公开故事，用户名可公开解析但不能由普通客户端直接修改：

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/life_paths_rls_assertions.sql
```

`supabase/tests/launch_onboarding_rls_assertions.sql` 断言偏好只对本人可见、匿名用户无表权限、普通客户端不能直接写表，并且用户不能拿别人的故事完成自己的 Onboarding：

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/launch_onboarding_rls_assertions.sql
```

`supabase/tests/launch_explore_rls_assertions.sql` 以匿名访客、故事所有者和普通登录用户身份断言：Explore 始终只返回已经解锁的公开故事，分类由受控标签词表执行，未知分类不会扩大查询，分页使用稳定复合游标：

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/launch_explore_rls_assertions.sql
```

`supabase/tests/launch_featured_entries_rls_assertions.sql` 断言匿名访客和故事作者都只能取得已解锁的公开精选故事，普通客户端没有 `featured_at` 写权限，故事转为非公开或未来胶囊时会由触发器自动取消精选：

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/launch_featured_entries_rls_assertions.sql
```

`supabase/tests/v13_global_search_rls_assertions.sql` 以匿名用户、作者和无关登录用户身份断言：私密故事只进入作者结果，未来时间胶囊对所有搜索身份都排除，路线和标签聚合不会泄露被锁内容，`total_count` 只统计当前可见结果：

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/v13_global_search_rls_assertions.sql
```

## 编辑精选运营方式

精选状态不是用户荣誉按钮，普通作者不能自行设置。执行 `202608070001_launch_featured_entries.sql` 后，只能从可信后端或 Supabase SQL Editor 维护；不要把 service role key 放入浏览器。选择一条已经公开且已解锁的故事：

```sql
update public.map_entries
set featured_at = now()
where id = '<ENTRY_UUID>'
  and visibility = 'public'
  and (unlock_at is null or unlock_at <= now());
```

取消精选：

```sql
update public.map_entries
set featured_at = null
where id = '<ENTRY_UUID>';
```

如果精选故事随后改为非公开，或被设置为尚未解锁的时间胶囊，数据库会自动清空 `featured_at`。首页地图以轻量浮层推荐最近设置的 1 条精选，Explore 最多展示 6 条；精选读取失败不会阻断地图和最新公开故事分页，Explore 会明确提示数据库功能尚未初始化或暂时不可用。

`supabase/tests/rls_manual_verification.sql` 保留了已有人工角色模拟说明。SQL Editor 默认高权限角色会绕过 RLS，不能把普通 SQL Editor 查询当作客户端权限验证。

## 服务端草稿与自动保存

执行 `202608080002_v13_entry_drafts.sql` 后，创建者编辑新故事或自己的已发布故事时，表单会在停止输入约 900ms 后自动保存。未发布正文存放在独立的 `entry_drafts` 表，不写入 `map_entries`，因此不会进入地图、Explore、搜索、公开主页、路线或标签聚合。“我的记录”提供继续写作和删除草稿入口；正式故事只有在用户点击创建或保存后，才由 `publish_entry_draft` 原子发布。

草稿只允许创建者通过 RLS 读取，普通客户端没有直接 INSERT、UPDATE 或 DELETE 权限。写入使用 revision 乐观锁；同一草稿在另一个标签页先保存后，旧标签页会收到冲突提示，不能覆盖较新的版本。编辑已发布故事时还会保存原故事的 `updated_at` 快照，避免陈旧草稿覆盖后来已经发布的修改。共同经历者继续使用既有字段级 RPC，不会获得或推断创建者草稿。

可在一次性本地 Supabase 数据库运行草稿权限与并发断言（不要在生产库运行）：

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/v13_entry_drafts_rls_assertions.sql
```

## 时间播放地图

首页地图提供“全部时间、单年份、时间范围”三种浏览方式。年份优先使用事件保存的 `occurred_year`，并兼容当地日期、当地精确时间、旧 `occurred_at` 和包含明确四位年份的大致时间；无法可靠识别年份的故事只在“全部时间”模式显示。

单年份模式可以自动播放，并直接跳到下一个实际有故事的年份，避免在长时间跨度的空白年份中停留。拖动时间轴只过滤当前已经过 RLS、身份作用域、群组资格和首页筛选处理的最多 500 条有界结果，不会为每一个滑块位置重新请求数据库。尚未解锁的时间胶囊仍由数据库读取权限控制；前端播放层还会拒绝渲染任何非创建者的未来胶囊残留数据。

## 同地点时间层

首页会在当前可见、当前筛选和当前时间播放结果内，将近似同地点的多个故事合成一个带数量的叠层标记。点击后可按事件时间升序阅读这一地点的故事。聚合发生在权限过滤之后，不会把私密、失效群组或未解锁时间胶囊纳入数量。

当前数据库没有独立 `places` 实体，因此采用保守的临时规则：地点名先进行 Unicode、大小写、空白和标点规范化；规范化名称一致且距离锚点不超过 60 米才聚合。地点名不同不会仅因坐标接近而合并；没有地点名时只合并 5 米内的记录。群组地图和时间线暂时保留单故事标记，避免改变既有选择流程。

未来如需稳定地点 ID、地点改名、别名或跨用户地点维护，建议新增独立增量 migration：创建 `places(id, canonical_name, normalized_name, latitude, longitude, created_at, updated_at)`，为 `map_entries` 增加可空 `place_id`，先保留原 `place_name/latitude/longitude` 兼容读取，再通过人工审核或高置信度任务渐进回填。不要依据当前近似聚合结果直接自动覆盖生产记录；地点读取和维护还需要独立 RLS、受控合并 RPC 与审计记录。

## 数据导出与账号删除

设置页支持三种本地下载格式：JSON 包含本人资料、本人故事、仍有权限读取的共同经历内容和本人故事路线；CSV 将故事平铺为表格；GeoJSON 将故事导出为 Point，并在 properties 中保留标题、时间、阅读范围、标签和情绪。共同经历内容始终带有 `ownership: participant`，不会被描述为用户原创。导出 RPC 不读取 `auth.users`，不会返回邮箱、密码、登录令牌或 Auth metadata。

账号删除提供“删除全部内容”和“匿名保留公开内容”两种方式。两种方式都会删除私密故事、群组故事、草稿和个人偏好，移除共同经历资格、点赞、关注及群组成员身份，并软删除评论正文。作为参与者时不会删除原作者内容。匿名保留时，公开故事和公开路线保留，但资料改为稳定的“已注销用户”占位，精选状态清除。存在有效群主或管理员职责时数据库会阻止删除，必须先转移群主、归档群组、退出管理角色或由群主降级。

Auth 身份只能由 Next.js 服务端接口调用 Supabase Admin API 软删除。部署环境必须额外设置：

```dotenv
SUPABASE_SERVICE_ROLE_KEY=服务端专用密钥
```

该变量不得使用 `NEXT_PUBLIC_` 前缀，不得写入浏览器、日志或仓库。删除接口先用当前 access token 确认用户，再用邮箱和用户刚输入的密码重新登录验证；密码不会写入数据库。浏览器只能创建自己的删除请求，事务化应用数据清理 RPC 只向 `service_role` 授权。如果 Auth 已停用但后续数据库清理失败，请求会标记为 `failed/application_cleanup_failed`，需要维护者从受控服务端重试，不能要求用户重新注册。

`202608270001_v14_security_reliability.sql` 新增私有持久化限流桶和仅 `service_role` 可执行的原子消费 RPC。账号删除按匿名化 IP（15 分钟 6 次）和用户（每小时 3 次）双重限制；客户端监控入口每个匿名化 IP 每分钟最多 20 次。数据库只保存 HMAC 后的 64 位摘要，不保存原始 IP、邮箱或 token。部署该版本前必须先执行 migration 并配置 `RATE_LIMIT_SECRET`，否则高风险接口会安全失败并返回暂不可用，不会降级为无保护模式。

在一次性本地 Supabase 数据库应用全部 migration 后，可执行真实权限与原子计数断言（不要在远端或生产库运行）：

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/v14_security_reliability_assertions.sql
```

脚本验证私有 schema、RLS、空 `search_path`、anon/authenticated 无执行权、`service_role` 最小执行权和固定窗口阻断行为，并在末尾回滚测试桶写入。

## 通知中心与邮件队列

执行 `202608280001_v14_notifications.sql` 后，登录用户可以在 `/notifications` 查看共同经历邀请与响应、协作编辑、权限变化、群组邀请与角色变化、群组归档、故事精选、线路外部调整和已解锁时间胶囊。通知每页读取 20 条，导航栏显示精确未读数量；账户退出或切换时，本地通知和未读数立即按身份作用域清空，旧请求不能写回新账户状态。Realtime 只用于触发重新查询，最终可见行仍由 `notifications.user_id = auth.uid()` 的 RLS 决定，并以通知 UUID 去重。

通知 payload 只保存标题、时间显示文本、地点名称、变化字段等安全摘要，不复制故事正文、精确坐标、邮箱、密码或 token。普通客户端只有本人通知与偏好的 `SELECT` 权限；标记已读和修改偏好通过校验 `auth.uid()` 的受控 RPC 完成。客户端不能插入通知、伪造 actor，也不能读取或更新邮件 outbox。安全通知可以选择站内或邮件，但数据库拒绝完全关闭。

`notification_email_outbox` 表示“等待邮件服务处理”，不表示已经送达。当前代码提供 `EmailProvider` 接口和明确返回 `provider_not_configured` 的开发 stub，没有连接 Resend、Postmark、SES 或其他邮件服务，也没有定时 worker。正式启用邮件前需要在服务端实现 provider adapter、用受控 worker 调用 service-role-only 的 claim/finish RPC，并使用自定义 SMTP 或事务邮件供应商；不得在浏览器中处理 outbox 或暴露 `SUPABASE_SERVICE_ROLE_KEY`。

时间胶囊通知会在登录用户加载通知入口时补齐。migration 另提供仅 `service_role` 可执行的批量同步钩子，供未来 Cron/Queue 使用；当前没有安装定时任务，因此不能宣称邮件会在解锁瞬间自动发送。

可在一次性本地 Supabase 数据库执行真实 RLS 与 outbox 断言（不要在远端或生产库运行）：

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/v14_notifications_rls_assertions.sql
```

## 故事图片与私有 Storage

执行 `202608280002_v14_story_media.sql` 后，故事创建者可以为已经保存的故事添加最多 10 张 JPEG、PNG 或 WebP 图片，调整顺序、选择封面并移除图片。浏览器提交的文件先在 Next.js Node 服务端检查 MIME 与文件魔数，限制为 4 MB 和 4000 万输入像素，再由 `sharp` 重新编码为 WebP 并生成 640 像素缩略图；该过程默认不复制 EXIF，因此 GPS、设备型号等隐私元数据不会进入 Storage。暂不支持动图或视频。

Migration 创建私有 `story-media` bucket。浏览器没有 Storage 写权限，也不能直接写 `entry_media_assets` 或调用预留 RPC；服务端先验证用户 access token，再通过仅 `service_role` 可执行的预留 RPC 校验故事创建者、群组成员状态、每故事 10 张上限和当前 500 MiB 临时配额，随后写入随机 UUID 路径。读取时，服务端先用当前用户 JWT 查询受 RLS 保护的资产行，再签发 5 分钟 URL。Storage 本身还有第二层 SELECT policy，继续调用 `can_read_entry`：

- 公开且已解锁故事：匿名用户可读取图片。
- 私密故事：仅创建者和既有规则允许的共同经历者可读取。
- 群组故事：仅当前有效群组成员可读取；退出或被移除后立即失权。
- 未解锁时间胶囊：除创建者外不能读取。
- 草稿：不创建媒体资产，也不发放图片地址。

签名图片使用 `next/image` 的 `unoptimized` 模式，避免 Next 图片优化缓存把私密图片变成可重复访问的公共缓存对象。数据库只保存 bucket 路径，不保存永久 URL。

故事删除、账号删除、上传失败或一小时未完成的上传会写入 `media_cleanup_queue`。部署环境还需设置至少 32 字节的服务端密钥：

```dotenv
SUPABASE_SERVICE_ROLE_KEY=服务端专用密钥
MEDIA_CLEANUP_SECRET=至少32字节的独立随机值
CRON_SECRET=至少32字节的独立随机值
```

清理端点保留受控的 `POST /api/media/cleanup`（请求头 `x-media-cleanup-secret`），同时支持 Vercel Cron 的 `GET`＋`Authorization: Bearer $CRON_SECRET`。`vercel.json` 在 Hobby 套餐允许的频率内每天 UTC 03:00 执行一次；Production 必须配置独立的 `CRON_SECRET`。应监控返回的 `claimed/cleaned/failed` 计数；响应不会返回文件路径或密钥。Migration 未执行或服务端密钥缺失时，界面会明确显示图片功能未初始化或暂不可用，不会退化为公开 bucket。

可在一次性本地 Supabase 数据库运行多身份、群组、时间胶囊、浏览器写权限和清理 worker grant 断言（不要在远端或生产库运行）：

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/v14_story_media_rls_assertions.sql
```

## 运营管理与内容治理

`202608290001_v14_governance.sql` 新增基础管理后台、账号限制、公开内容治理和审计日志。该 migration 尚未自动应用到任何远端项目；应先在 Preview/测试项目执行并完成多身份验证，再安排生产变更。

Migration 创建 `app_admins`、`account_moderation` 和 `moderation_audit_logs`，并为故事与故事路线增加 `active / restricted / removed` 治理状态。普通用户不能写入这些表或字段；所有管理动作均经过校验当前 `auth.uid()` 的 `security definer` RPC，使用空 `search_path`，写入不含私密正文的审计日志。后台只列出公开故事/公开路线的标题与统计，不会因为管理员身份读取其他用户的私密故事、群组故事或未解锁时间胶囊。

账号被限制后，其公开资料和公开内容立即退出访客发现，数据库触发器同时阻止该账号继续创建或修改主要 UGC；本人仍可读取自己的资料和已有内容，并可走现有账号删除流程。内容下架是软治理状态，不物理删除原始故事。举报支持公开 Story Route，并继续实行同一举报人、同一目标一小时冷却。

首次管理员必须由可信维护者在 migration 执行后人工引导。先从 Dashboard 的 Authentication 用户列表确认准确 UUID，再在 SQL Editor 执行：

```sql
insert into public.app_admins (user_id)
values ('准确的管理员用户 UUID');
```

不要按昵称猜测 UUID，不要建立公开的“申请管理员”接口。管理员登录后，应用会用当前 Supabase access token 建立短期 HttpOnly 管理会话；`/admin` 还会在服务端再次验证角色。普通用户访问页面得到与不存在页面相同的 404，直接调用管理 RPC 也会被数据库拒绝。

本地一次性数据库可运行治理 RLS 断言（不要在远端或生产库运行）：

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/v14_governance_rls_assertions.sql
```

脚本验证普通用户不能打开管理 RPC、管理员不能读取其他用户私密正文、受限公开内容不会向匿名用户泄露、受限账号无法继续写 UGC，以及治理动作会留下审计记录。

## 产品分析与运营指标

`202608290002_v14_product_analytics.sql` 新增隐私有界的 `product_events`。浏览器不能直接读取或写入事件表，只能调用幂等的 `track_product_event` RPC；该函数从 `auth.uid()` 推导登录身份，不接受可伪造的用户 ID。事件属性采用严格白名单，只允许来源、内容类型、导出格式、可见性与结果数量分桶等低敏标量。故事正文、标题、搜索词、经纬度、邮箱、密码和令牌既不在前端 schema 中，也会被数据库拒绝。

管理后台的“产品指标”展示最近 30 天 Acquisition、Activation、Engagement、D1/D7/D30 留存，以及“注册→Onboarding→首个故事→第二个故事→七日内回访”和“Explore→公开故事→作者主页→注册”漏斗。`admin_get_product_analytics` 只返回聚合数值，普通用户没有执行权；管理员也不会通过该接口拿到原始事件或用户 ID。`session_started` 每个浏览器标签页会话、每个登录账户最多记录一次，因此这里的活跃和留存是产品行为指标，不是计费或审计事实。

本地一次性数据库可运行分析权限断言（不要在远端或生产库运行）：

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/v14_product_analytics_rls_assertions.sql
```

当前没有接入第三方分析服务。产品事件保存在项目 PostgreSQL 中；上线前应由隐私/法律审阅确定正式保留期限，并通过受控运维任务执行清理，不能把原始事件无限期保留。

## 套餐、使用量与配额

`202608290003_v14_commercial_foundation.sql` 新增 `plans`、`plan_entitlements` 与 `user_subscriptions`。业务能力不按 `Free / Supporter / Creator` 名称硬编码，而是读取 `can_upload_media`、`max_storage_bytes`、`max_media_files`、`max_story_routes` 与 `advanced_export`。未建立订阅记录的用户安全回退到 Free；Free 继续保留原有 500 MiB 图片空间，避免 migration 改变现有体验。

登录用户可在 `/settings/usage` 查看自己创建的故事数量、未归档路线、媒体文件和存储空间。`get_my_commercial_access()` 从 `auth.uid()` 推导身份，并从真实业务表计算使用量；浏览器不能写订阅或套餐。媒体预留 RPC 与故事路线触发器在 advisory lock 内执行配额检查，可阻止并发请求同时越过上限。达到上限只阻止新增资源，不会删除、隐藏或改变现有内容权限。

本阶段没有连接支付商、没有创建商品，也没有开放升级按钮。`PaymentProvider` 当前明确返回 `payments_disabled`，不会伪造 checkout 或客户门户 URL。未来接入任何支付服务时，应由服务端 webhook 维护 `user_subscriptions`，签名验证、幂等键、退款/争议和宽限期策略需要作为独立增量迭代完成。

本地一次性数据库可执行套餐隔离与配额断言（不要在远端或生产库运行）：

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/v14_commercial_foundation_rls_assertions.sql
```

## 帮助、反馈、Feature Flags 与服务状态

`202608290004_v14_product_completeness.sql` 新增 `product_feedback`、`feature_flags` 和 `feature_flag_overrides`。三张表全部启用 RLS 并撤销浏览器表权限。反馈只能通过 `/api/feedback` 提交：服务端验证可选的 Supabase access token，从验证结果派生 `user_id`，同时按匿名化 IP 和登录用户执行持久化限流，再使用 server-only service role 写入。反馈只保存分类、用户主动填写的说明、无查询参数的当前 pathname、构建版本和处理状态，不自动采集故事正文、截图、邮箱、密码或 token。

页面右下角提供全局“反馈”入口，支持 Bug、功能建议、内容问题和其他；原生对话框提供键盘焦点约束、Escape 关闭和关闭后的焦点恢复。若 `RATE_LIMIT_SECRET`、service role 或 migration 尚未配置，接口安全失败并显示普通中文提示，不会退化为无保护公开写入。

Feature Flags 初始包含 `media_upload`、`notifications`、`subscriptions` 和 `creator_features`。`get_evaluated_feature_flags()` 不接收用户 ID，只根据 `auth.uid()`、全局开关、百分比和可信维护者写入的个人覆盖项返回最终布尔值。匿名访问不会进入非 100% 的百分比分流。Feature Flag 只控制产品展示和灰度，不能授予 Story、群组、媒体、管理后台或订阅的数据库权限。

新增公开静态页面 `/help`、`/terms`、`/privacy`、`/community-guidelines` 和 `/status`。注册页可以直接访问三份法律/社区草案；草案均明确标注 `Draft / 待法律审阅`，不得当作最终法律保证。上线前至少需要专业审阅适用法律与管辖、未成年人、内容许可、侵权流程、数据处理法律基础、供应商和跨境传输、数据保留、申诉机制、付费退款和责任限制。

`/status` 复用 `/api/health`，只公开 Web App、Database、Media 的当前 `ok / degraded`、短版本号和检查时间；不会返回数据库 URL、Bucket 名、环境变量或密钥，也不会伪造历史 SLA。媒体检查要求服务端 Supabase 凭据和私密 `story-media` Bucket 均可用。

可选公开构建标签：

```dotenv
NEXT_PUBLIC_APP_VERSION=
```

Vercel Production 优先使用 `VERCEL_GIT_COMMIT_SHA`，本地未设置时显示 `local`。本阶段没有连接 CMS、外部状态平台或反馈 SaaS。

本地一次性数据库可执行反馈和 Feature Flag 权限断言（不要在远端或生产库运行）：

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/v14_product_completeness_rls_assertions.sql
```

本地一次性数据库验证：

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/v13_data_portability_account_deletion_assertions.sql
```

## 浏览器端到端验证矩阵

1. 准备账户 A、B；A 创建一条公开和一条私密记录。
2. A 退出：私密标记和已打开的私密详情应立即消失，公开记录保留。
3. B 登录：只能看到 A 的公开记录，按 A 的私密记录 ID 访问也应得到“无权限或不存在”。
4. B 直接调用 API 更新、删除 A 的记录或伪造 A 的 `user_id`，必须失败。
5. 未登录填写记录并提交，登录后应恢复通过 Zod 校验的版本化草稿；损坏草稿会被删除。
6. 访问 `/login?next=//evil.example`、`/login?next=/%5Cevil.example` 等地址，登录后必须回到 `/`，不能跳转站外。
7. A 创建公开群组，B 加入；A 发布群组记录后 B 可查看、点赞和评论，C 不可读取。
8. B 退出群组后，群组地图、详情、点赞与评论立即不可见。
9. A 创建私密群组并邀请 B；B 接受后才取得访问权。
10. B 关注 A；信息流只出现 A 的公开记录、B 有权访问的群组记录和 B 自己的记录，不出现 A 的私密记录。
11. 创建/编辑记录时切换地点分类，地图图标立即更新；多分类与群组筛选可以组合。
12. 退出登录后访问 `/explore`：公开故事仍可见；私密、群组和未解锁胶囊不出现，五个分类只能返回带有对应公开标签的故事。
12. 退出登录后，所有 `private` 和 `group` 内容以及已打开详情立即消失。
13. 在 `/timeline` 选择至少两条记录创建公开路线；公开路线只能接受公开节点，匿名窗口可打开分享链接。
14. 把其中一个公开节点改为私密；原分享链接应立即不再向匿名用户返回路线或地点数据。
15. 创建群组路线；非成员只能看到通用无权限页面，成员退出后路线节点应立即不可读。
16. 使用跨 ±180° 的两个地点验证路线不会画出横跨整张世界地图的错误长线。
17. A 邀请 B 参与私密记录；B 接受前不能读取内容，接受后只能修改获授权字段，不能改变可见性、群组、评论设置或删除。
18. B 接受后修改正文和标签，A/B 能看到数据库编辑日志；C 和匿名用户看不到私密标签聚合。
19. 群组记录只能邀请有效成员；成员离组后即使参与状态仍为 accepted，也不能继续读取或编辑。

## 查询上限与透明度

地图和“我的记录”每次读取 `500 + 1` 条：第 501 条只用于判断截断，页面只渲染最近 500 条并明确提示“搜索、筛选和排序可能不完整”，不会无限读取全部数据。

后续查询设计：

1. 按地图边界请求，不再先取全局最近记录。
2. 用更新时间与 ID 做 keyset pagination，避免大 offset。
3. 使用 PostGIS 空间索引和视野范围查询。
4. 对低缩放级别使用服务端标记聚合。
5. 使用 PostgreSQL `tsvector`/全文索引取代客户端全文筛选。

## 错误处理与监控

Supabase/Auth/PostgreSQL 已知错误按 code/status 映射为中文提示；未知错误只显示统一安全文案，不向用户暴露表名、SQL、约束名、堆栈或 Supabase 内部消息。开发环境会从 `reportOperationalError` 输出便于调试的白名单字段；生产环境只把 context、错误类型、code/status、digest 和不含查询参数的 route 发往同源 `/api/monitoring/client`。生产监控事件不包含 message、stack、故事标题/正文、邮箱、坐标、密码或 token，并由服务端写入结构化 runtime log。当前没有绑定任何付费监控提供商；未来 adapter 应继续消费同一安全事件，而不是在组件中直接上传原始错误。

`app/error.tsx` 与 `app/global-error.tsx` 覆盖页面和根级 React 错误。`/api/health` 使用浏览器级 Supabase key 做有界数据库可达性检查，只返回 `ok/degraded`、组件状态、短版本号和检查时间；不返回数据库 URL、schema、环境变量或原始错误。健康接口返回 `cache-control: no-store`，数据库不可达时使用 HTTP 503。

## 备份与灾难恢复

完整流程见 [`docs/disaster-recovery.md`](docs/disaster-recovery.md)。当前目标为 RPO 24 小时、RTO 8 小时，但在定时备份和季度恢复演练实际落实前，它们只是目标而非 SLA。数据库逻辑备份、Storage 对象备份和不含 secret 的平台配置清单必须分别保存；Supabase 数据库备份不包含 Storage 文件。

本地可运行非破坏性检查：

```bash
npm run dr:validate
```

该命令只核对 migration/rebuild 清单、灾备文档章节和 `.env.example` 的空 secret 占位，不连接 Supabase、不恢复数据、不修改远端资源。正式恢复必须先进入隔离项目，通过匿名、所有者、共同经历者与群组权限矩阵后才能考虑切换流量。

## 浏览器安全与移动端导航

Next.js 为全部页面返回 CSP、`frame-ancestors 'none'`、`X-Frame-Options: DENY`、`Referrer-Policy`、`Permissions-Policy`、COOP 和 `nosniff`。CSP 只允许项目自身、Supabase 连接、HTTPS 图片与必要的 Leaflet/Next.js 运行资源。新设置的用户和群组头像必须使用 HTTPS；旧 HTTP 图片会被 CSP 阻止加载，修改资料时应换成 HTTPS 地址。

760px 以下使用明确的“菜单”按钮打开纵向导航，不再依赖不可见的横向滚动；页面根节点禁止横向溢出，地图筛选和新建记录按钮保持在 320px 视口内。登录、注册互相切换时会保留经过白名单校验的 `next`，支持记录详情、群组、用户主页、时间线和故事路线，同时继续拒绝外部 URL 与异常编码。

## 依赖安全状态（2026-08-27）

Phase 1 在不跨 Next.js 主版本的前提下升级到 `next@16.3.3` 与匹配的 `eslint-config-next@16.3.3`。实际安装树使用 `postcss@8.5.23`、`sharp@0.35.4` 与 `nanoid@3.3.18`，消除了旧版 Next.js 间接依赖的已知 high。开发工具链中的 `brace-expansion` 与 `js-yaml` 也通过兼容的传递依赖更新修复；没有执行 `npm audit fix --force`，没有降级 Next.js，也没有使用 package override 绕过官方依赖范围。

本次验证结果：`npm audit --omit=dev` 为 0，完整 `npm audit` 也为 0。该结果只代表锁文件在 2026-08-27 当时的公开 advisory 状态；每次 Preview/Production 发布仍必须重新审计，不能把一次结果当作永久安全保证。

## 目录与源码交付清理

`.gitignore` 已排除 `.next`、`node_modules`、`.DS_Store`、`__MACOSX`、`*.tsbuildinfo`、覆盖率、日志和本地环境变量。源码压缩包应排除：

```text
node_modules/
.next/
out/
coverage/
.DS_Store
__MACOSX/
*.tsbuildinfo
.env
.env.local
.env.*.local
```

必须保留 `.env.example`。打包前可用 `find . -name '.DS_Store' -o -name '*.tsbuildinfo'` 检查，不要把真实密钥或构建缓存放入交付物。

## 已知限制

- v1.1 与 v1.2 的 `202608040001` 至 `202608070001` migration 必须按顺序应用；`202608050005` 修复匿名 Explore ACL，`202608050006` 补充复合标签发现能力，`202608070001` 增加可信运营端维护的公开故事精选。
- v1.3 的 `202608080001_v13_global_search.sql`、`202608080002_v13_entry_drafts.sql` 和 `202608080003_v13_data_portability_account_deletion.sql` 已按顺序应用到当前测试项目；正式环境仍必须按相同顺序单独执行。
- `202608110001_v13_global_search_escape_fix.sql`、`202608110002_trigger_function_execute_hardening.sql` 与 `20260811111243_timeline_participant_acl_fix.sql` 已于 2026-08-11 按顺序应用到测试项目 `bmzsabgzzrwekghdceyj`。匿名关键词与特殊字符搜索已验证不再返回 `22025`，两个内部触发器函数对 `public`、`anon` 和 `authenticated` 的直接执行权均已撤销；匿名公共时间线可以正常调用，同时匿名直接读取参与关系仍返回零行。
- `202608270001_v14_security_reliability.sql`、`202608280001_v14_notifications.sql` 与 `202608280002_v14_story_media.sql` 已于 2026-08-28 按顺序应用到测试项目；随后追加 `20260828102358_v14_rate_limit_clock_fix.sql` 与 `20260828102558_v14_rate_limit_builtin_fix.sql` 修复 PostgreSQL 17 兼容问题。远端 migration 历史当前同步至这 30 份文件；本地新增的治理、产品分析、商业化基础与产品完整性 migration 尚未远端执行。媒体清理使用私密 Storage、独立服务端密钥与每日受控 Cron。
- 数据导出与账号删除依赖 `202608080003_v13_data_portability_account_deletion.sql` 和服务端 `SUPABASE_SERVICE_ROLE_KEY`。缺少任一项时页面会明确报告未初始化或服务端未配置；不会把管理密钥放入客户端作为替代方案。
- 全局搜索每页 20 条，数据库单次最多允许 51 条。搜索地图只绘制当前已加载页中的地点结果；时间胶囊在解锁前即使对作者可读，也不会进入搜索、标签结果数量或包含它的路线结果。
- Explore 的五个主题分类基于受控标签关键词，不会用正文猜测分类；复合标签（例如 `#成都科幻`、`#文学空间`）可以进入对应分类，未添加相关标签的公开故事仍只会出现在“全部”。
- `202608070001_launch_featured_entries.sql` 已于 2026-08-07 应用到测试项目 `bmzsabgzzrwekghdceyj`；远程 migration 历史已同步至 `202608070001`，匿名精选 RPC 验证返回 HTTP 200。SQL/RLS 断言脚本仍应只在可丢弃的本地 Supabase 数据库中执行。
- 尚未设置精选故事时 RPC 会返回空数组，首页不会显示精选浮层，Explore 仍正常展示最新公开故事；这不是初始化错误，也不会用伪造数据填充精选区域。
- 2026-08-11 已在测试项目使用隔离的 A/B/C 账户完成浏览器与普通 publishable-key 客户端验证：匿名与未授权账户无法读取 A 的私密故事；B 接受邀请后只能修改获授的时间字段；撤回后已打开详情立即清空；C 无法读取群组故事；B 退出群组后 UI 与 API 同时失去访问权。测试结束后已按精确 UUID 清理 3 个测试账户、3 条测试故事和 1 个测试群组；不能把这组人工验证替代为长期 CI。
- 首页同地点聚合是当前有界结果上的近似分组，不是永久地点实体；别名不同的同一地点暂不会自动合并，群组地图与时间线仍保留单故事标记。
- OpenStreetMap 公共瓦片适合开发和低流量 MVP；生产流量需遵守其政策并评估合规瓦片服务。
- 头像仅支持 URL；评论为平铺分页，不支持回复树；未实现私信、即时聊天或真实收费。套餐、entitlement、使用量与配额边界已经建立，但支付 provider 保持关闭。当前管理员后台覆盖基础治理和第一版产品漏斗/留存，不是完整 CRM 或 BI 系统；分析事件保留期限与自动清理任务仍需上线前确定。
- 公开群组成员列表当前可由访客读取；私密群组成员列表只对有效成员开放。
- 群组目录、群组记录、成员、邀请和评论使用“时间＋稳定 ID”的复合 keyset cursor，并在追加页面时去重；群组地图仍按页限制读取，不会一次加载全部数据。
- 时间线当前使用 offset 分页；数据量增长后应迁移为由“时间是否未定＋事件年份＋当地时间＋创建时间＋ID”组成的 keyset cursor。
- 路线编辑器只在选择群组路线时加载其他成员的群组记录；私密路线编辑器默认只列作者自己的记录，已有且仍有权限的群组节点继续兼容。
- 删除是永久操作，只有二次确认，没有回收站。
- 邮件通知当前只进入安全 outbox，没有正式 provider、worker 或调度器；选择邮件模式不代表邮件已经发送。Story Route 当前仍只有创建者可以编辑，通知钩子只覆盖有权限的管理员归档/精选等外部调整，不扩大编辑权限。
- 故事图片目前只允许故事创建者管理；共同经历者即使拥有正文或地点字段权限，也不会自动获得媒体写权限。500 MiB Free 上限已由 entitlement 模型管理，客户端不会按套餐名称决定媒体或路线权限。

## 下一阶段建议

优先顺序是：在隔离 Supabase 按顺序应用并验证 `202608290001_v14_governance.sql`、`202608290002_v14_product_analytics.sql`、`202608290003_v14_commercial_foundation.sql`、`202608290004_v14_product_completeness.sql`，人工引导首位管理员并完成普通用户/管理员双身份冒烟；由法律专业人士审阅三份草案；确定分析、反馈与审计数据保留期限；为邮件 outbox 接入 worker 与 provider；把所有 RLS SQL 断言纳入本地 Supabase CI；如未来启用付费，应先实现服务端 webhook、幂等账单同步和取消/退款策略，再开放任何升级入口。

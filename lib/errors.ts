type ErrorLike = Record<string, unknown>;

const ERROR_CODE_MESSAGES: Record<string, string> = {
  invalid_credentials: "邮箱或密码不正确。",
  email_address_not_authorized:
    "当前 Supabase 邮件服务不能向这个邮箱发送验证邮件。测试环境可以关闭 Confirm Email，正式环境需要配置自定义 SMTP。",
  email_exists: "这个邮箱已经注册过了，请直接登录或使用其他邮箱。",
  user_already_exists:
    "这个邮箱已经注册过了，请直接登录或使用其他邮箱。",
  signup_disabled: "当前项目没有开启邮箱注册。",
  email_provider_disabled: "当前项目没有开启邮箱注册。",
  weak_password: "密码强度不足，请至少输入 8 个字符。",
  session_not_found: "登录状态已过期，请重新登录。",
  refresh_token_not_found: "登录状态已过期，请重新登录。",
  refresh_token_already_used: "登录状态已过期，请重新登录。",
  over_email_send_rate_limit: "验证邮件发送次数过多，请稍后再试。",
  email_address_invalid: "请输入有效的邮箱地址。",
  "23505": "已有相同数据，请检查后重试。",
  "23514": "提交的数据不符合要求，请检查后重试。",
  "23503": "关联的内容不存在，或已经失效。",
  "22023": "提交的时间或时区无效，请检查后重试。",
  "42501": "你没有权限执行这个操作。",
  "55000": "当前状态不允许这个操作，请刷新后重试。",
  P0002: "内容不存在，或你已经没有访问权限。",
  "42P01": "数据库尚未完成最新升级，请联系项目维护者。",
  "42883": "数据库功能尚未完成初始化，请联系项目维护者。",
  PGRST200: "数据库关系配置不完整，请联系项目维护者。",
  PGRST202: "数据库功能尚未完成初始化，请联系项目维护者。",
  PGRST205: "数据库功能尚未完成初始化，请联系项目维护者。",
  PGRST116: "记录不存在，或你没有权限查看它。",
  PGRST301: "登录状态已过期，请重新登录。",
};

function asErrorLike(error: unknown): ErrorLike | null {
  return typeof error === "object" && error !== null ? (error as ErrorLike) : null;
}

function getErrorString(error: unknown, key: string) {
  const value = asErrorLike(error)?.[key];
  return typeof value === "string" ? value : null;
}

export function getErrorCode(error: unknown) {
  return getErrorString(error, "code");
}

export function getErrorStatus(error: unknown) {
  const status = asErrorLike(error)?.status;
  return typeof status === "number" ? status : null;
}

export function getErrorMessage(error: unknown) {
  return getErrorString(error, "message");
}

export function getFriendlyError(
  error: unknown,
  fallback = "操作没有成功，请稍后重试。",
  options?: { requireEmailConfirmation?: boolean },
) {
  const code = getErrorCode(error);
  if (code === "email_not_confirmed") {
    return options?.requireEmailConfirmation === false
      ? "这个账户仍处于未确认状态。请检查 Supabase 的 Confirm Email 设置，或使用新的测试账户注册。"
      : "请先完成邮箱验证，再登录。";
  }
  const normalizedMessage =
    getErrorString(error, "message")?.toLocaleLowerCase("en-US") ?? "";
  if (normalizedMessage.includes("published route requires at least two items")) {
    return "发布路线至少需要两个地点节点。";
  }
  if (normalizedMessage.includes("one or more route items are not eligible")) {
    return "部分路线节点已无权使用，或与路线可见性不兼容。";
  }
  if (normalizedMessage.includes("route cannot be edited")) {
    return "这条路线已归档，或你没有编辑权限。";
  }
  if (normalizedMessage.includes("active group membership required")) {
    return "你需要保持有效群组成员身份，且群组不能已归档。";
  }
  if (normalizedMessage.includes("unlock time must be in the future")) {
    return "时间胶囊的解锁时间必须晚于现在。";
  }
  if (normalizedMessage.includes("only the entry owner can change unlock time")) {
    return "只有故事创建者可以修改时间胶囊的解锁时间。";
  }
  if (normalizedMessage.includes("locked capsule is only eligible")) {
    return "未解锁的时间胶囊只能加入创建者自己的私密路线。";
  }
  if (code && ERROR_CODE_MESSAGES[code]) return ERROR_CODE_MESSAGES[code];

  const status = getErrorStatus(error);
  if (status === 401) return "登录状态已过期，请重新登录。";
  if (status === 403) return "你没有权限执行这个操作。";
  if (status === 429) return "操作过于频繁，请稍后再试。";

  const message = normalizedMessage;
  if (message.includes("invalid login credentials")) return "邮箱或密码不正确。";
  if (message.includes("email not confirmed")) {
    return options?.requireEmailConfirmation === false
      ? "这个账户仍处于未确认状态。请检查 Supabase 的 Confirm Email 设置，或使用新的测试账户注册。"
      : "请先完成邮箱验证，再登录。";
  }
  if (message.includes("user already registered")) {
    return "这个邮箱已经注册过了，请直接登录或使用其他邮箱。";
  }
  if (message.includes("password should be")) {
    return "密码强度不足，请至少输入 8 个字符。";
  }
  if (message.includes("jwt") || message.includes("session")) {
    return "登录状态已过期，请重新登录。";
  }
  if (message.includes("row-level security") || message.includes("permission")) {
    return "你没有权限执行这个操作。";
  }
  if (message.includes("invitation expired")) return "邀请已过期，请联系群组管理员重新邀请。";
  if (message.includes("invitation already handled")) return "邀请已经处理过了。";
  if (message.includes("owner must transfer")) return "群主需要先转移群主身份，才能退出群组。";
  if (message.includes("group is archived") || message.includes("group is unavailable")) {
    return "群组已归档，不能继续执行这个操作。";
  }
  if (message.includes("failed to fetch") || message.includes("network")) {
    return "网络连接失败，请检查网络后重试。";
  }

  return fallback;
}

export function reportOperationalError(error: unknown, context: string) {
  if (process.env.NODE_ENV !== "production") {
    const source = asErrorLike(error);
    console.warn(`[story-map:${context}]`, {
      code: getErrorCode(error),
      status: getErrorStatus(error),
      message: getErrorMessage(error),
      details:
        typeof source?.details === "string" ? source.details : undefined,
      hint: typeof source?.hint === "string" ? source.hint : undefined,
    });
  }
  // 生产环境统一从这里接入 Sentry 等监控服务，避免各组件自行上报。
}

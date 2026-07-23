type ErrorLike = Record<string, unknown>;

const ERROR_CODE_MESSAGES: Record<string, string> = {
  invalid_credentials: "邮箱或密码不正确。",
  email_not_confirmed: "请先前往邮箱完成验证，再登录。",
  user_already_exists: "这个邮箱已经注册过了，请直接登录。",
  weak_password: "密码强度不足，请至少输入 8 个字符。",
  session_not_found: "登录状态已过期，请重新登录。",
  refresh_token_not_found: "登录状态已过期，请重新登录。",
  refresh_token_already_used: "登录状态已过期，请重新登录。",
  over_email_send_rate_limit: "邮件发送过于频繁，请稍后再试。",
  email_address_invalid: "请输入有效的邮箱地址。",
  "23505": "已有相同数据，请检查后重试。",
  "23514": "提交的数据不符合要求，请检查后重试。",
  "23503": "关联的内容不存在，或已经失效。",
  "22023": "提交的时间或时区无效，请检查后重试。",
  "42501": "你没有权限执行这个操作。",
  "55000": "当前状态不允许这个操作，请刷新后重试。",
  P0002: "内容不存在，或你已经没有访问权限。",
  "42P01": "数据库尚未完成最新升级，请联系项目维护者。",
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

export function getFriendlyError(
  error: unknown,
  fallback = "操作没有成功，请稍后重试。",
) {
  const code = getErrorString(error, "code");
  if (code && ERROR_CODE_MESSAGES[code]) return ERROR_CODE_MESSAGES[code];

  const status = asErrorLike(error)?.status;
  if (status === 401) return "登录状态已过期，请重新登录。";
  if (status === 403) return "你没有权限执行这个操作。";
  if (status === 429) return "操作过于频繁，请稍后再试。";

  const message =
    getErrorString(error, "message")?.toLocaleLowerCase("en-US") ?? "";
  if (message.includes("invalid login credentials")) return "邮箱或密码不正确。";
  if (message.includes("email not confirmed")) {
    return "请先前往邮箱完成验证，再登录。";
  }
  if (message.includes("user already registered")) {
    return "这个邮箱已经注册过了，请直接登录。";
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
    console.error(`[story-map:${context}]`, error);
  }
  // 生产环境统一从这里接入 Sentry 等监控服务，避免各组件自行上报。
}

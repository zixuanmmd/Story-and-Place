import {
  getErrorCode,
  getErrorMessage,
  getErrorStatus,
} from "@/lib/errors";

export type GroupLoadErrorKind =
  | "initialization"
  | "permission"
  | "relationship"
  | "session"
  | "network"
  | "unknown";

export type GroupLoadError = {
  kind: GroupLoadErrorKind;
  message: string;
};

const INITIALIZATION_CODES = new Set([
  "42P01",
  "42883",
  "PGRST202",
  "PGRST205",
]);

export function classifyGroupLoadError(error: unknown): GroupLoadError {
  const code = getErrorCode(error);
  const status = getErrorStatus(error);
  const message = getErrorMessage(error)?.toLocaleLowerCase("en-US") ?? "";

  if (code && INITIALIZATION_CODES.has(code)) {
    return {
      kind: "initialization",
      message: "群组功能尚未完成数据库初始化，请执行最新 migration。",
    };
  }
  if (code === "PGRST200") {
    return {
      kind: "relationship",
      message: "群组数据关系配置不完整，请联系项目维护者。",
    };
  }
  if (code === "42501" || status === 403) {
    return {
      kind: "permission",
      message: "当前账户没有权限读取群组，请重新登录后重试。",
    };
  }
  if (
    code === "PGRST301" ||
    status === 401 ||
    message.includes("jwt") ||
    message.includes("session")
  ) {
    return {
      kind: "session",
      message: "登录状态已过期，请重新登录。",
    };
  }
  if (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("load failed")
  ) {
    return {
      kind: "network",
      message: "网络连接失败，请检查网络后重试。",
    };
  }
  return { kind: "unknown", message: "群组加载失败，请重试。" };
}

export function getGroupDirectoryViewMode(
  loading: boolean,
  error: GroupLoadError | null,
) {
  if (loading) return "loading" as const;
  if (error) return "error" as const;
  return "content" as const;
}

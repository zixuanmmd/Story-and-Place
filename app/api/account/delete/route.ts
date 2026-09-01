import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { reportOperationalError } from "@/lib/errors";
import { consumeRateLimit, getRequestClientIdentifier } from "@/lib/security/rate-limit";
import { getSupabaseServerAdminClient } from "@/lib/supabase/server-admin";
import type { Database } from "@/types/database";

export const runtime = "nodejs";

const requestSchema = z.object({
  requestId: z.string().uuid(),
  mode: z.enum(["delete_all", "preserve_public"]),
  confirmation: z.literal("删除我的账号"),
  password: z.string().min(1).max(1000),
}).strict();

function jsonError(message: string, status: number, retryAfterSeconds?: number) {
  return NextResponse.json(
    { ok: false, message },
    {
      status,
      headers: {
        "cache-control": "no-store",
        ...(retryAfterSeconds ? { "retry-after": String(retryAfterSeconds) } : {}),
      },
    },
  );
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const browserKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !browserKey || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError("账号删除服务尚未完成配置，请联系项目维护者。", 503);
  }

  try {
    const ipLimit = await consumeRateLimit(
      { scope: "account-delete-ip", limit: 6, windowSeconds: 900 },
      getRequestClientIdentifier(request),
    );
    if (!ipLimit.allowed) {
      return jsonError("删除请求过于频繁，请稍后再试。", 429, ipLimit.retryAfterSeconds);
    }
  } catch (error) {
    reportOperationalError(error, "account-delete:ip-rate-limit");
    return jsonError("账号安全服务暂时不可用，请稍后重试。", 503);
  }

  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : null;
  if (!accessToken) return jsonError("登录状态已过期，请重新登录。", 401);

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return jsonError("请完整确认删除方式、确认文字和密码。", 400);
  }

  const authClient = createClient<Database>(supabaseUrl, browserKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  const user = userData.user;
  if (userError || !user?.email) return jsonError("登录状态已过期，请重新登录。", 401);

  try {
    const userLimit = await consumeRateLimit(
      { scope: "account-delete-user", limit: 3, windowSeconds: 3600 },
      user.id,
    );
    if (!userLimit.allowed) {
      return jsonError("删除请求过于频繁，请稍后再试。", 429, userLimit.retryAfterSeconds);
    }
  } catch (error) {
    reportOperationalError(error, "account-delete:user-rate-limit");
    return jsonError("账号安全服务暂时不可用，请稍后重试。", 503);
  }

  const passwordClient = createClient<Database>(supabaseUrl, browserKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: passwordData, error: passwordError } =
    await passwordClient.auth.signInWithPassword({ email: user.email, password: body.password });
  if (passwordError || passwordData.user?.id !== user.id) {
    return jsonError("密码不正确，账号尚未删除。", 403);
  }

  const admin = getSupabaseServerAdminClient();
  const { data: deletionRequest, error: requestError } = await admin
    .from("account_deletion_requests")
    .select("id, user_id, deletion_mode, status")
    .eq("id", body.requestId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (
    requestError
    || !deletionRequest
    || deletionRequest.deletion_mode !== body.mode
    || !["pending", "processing", "failed"].includes(deletionRequest.status)
  ) {
    return jsonError("删除请求不存在或已经失效，请重新开始。", 409);
  }

  const { error: deleteAuthError } = await admin.auth.admin.deleteUser(user.id, true);
  if (deleteAuthError) {
    await admin.from("account_deletion_requests").update({
      status: "failed",
      failure_code: "auth_soft_delete_failed",
    }).eq("id", body.requestId);
    return jsonError("账号暂时无法删除，所有数据仍保持原状，请稍后重试。", 502);
  }

  let cleanupError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { error } = await admin.rpc("finalize_account_deletion", {
      p_request_id: body.requestId,
      p_user_id: user.id,
    });
    cleanupError = error;
    if (!error) break;
  }
  if (cleanupError) {
    await admin.from("account_deletion_requests").update({
      status: "failed",
      failure_code: "application_cleanup_failed",
    }).eq("id", body.requestId);
    return NextResponse.json(
      {
        ok: false,
        accountDisabled: true,
        message: "登录账号已停用，但数据清理需要维护者继续处理。请勿重复注册。",
      },
      { status: 202, headers: { "cache-control": "no-store" } },
    );
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
}

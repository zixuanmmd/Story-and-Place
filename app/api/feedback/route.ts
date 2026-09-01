import { NextResponse } from "next/server";
import { reportOperationalError } from "@/lib/errors";
import {
  consumeRateLimit,
  getRequestClientIdentifier,
  RateLimitConfigurationError,
} from "@/lib/security/rate-limit";
import { getSupabaseServerAdminClient } from "@/lib/supabase/server-admin";
import {
  getBearerAccessToken,
  getVerifiedRequestUser,
} from "@/lib/supabase/server-request";
import { feedbackSubmissionSchema } from "@/lib/validation/feedback";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 4096;

function jsonMessage(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json(
    { message },
    { status, headers: { "cache-control": "no-store", ...headers } },
  );
}

function getAppVersion() {
  const version = (
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12)
    ?? process.env.NEXT_PUBLIC_APP_VERSION?.trim().slice(0, 80)
  );
  return version || "local";
}

async function parseBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) return null;
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return null;
  try {
    return feedbackSubmissionSchema.safeParse(JSON.parse(body));
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const parsed = await parseBody(request).catch(() => null);
  if (!parsed?.success) return jsonMessage("反馈内容格式不正确，请检查后重试。", 400);

  try {
    const accessToken = getBearerAccessToken(request);
    const clientIdentifier = getRequestClientIdentifier(request);
    const ipLimit = await consumeRateLimit(
      { scope: "product-feedback-ip", limit: 5, windowSeconds: 900 },
      clientIdentifier,
    );
    if (!ipLimit.allowed) {
      return jsonMessage("反馈提交得有些频繁，请稍后再试。", 429, {
        "retry-after": String(ipLimit.retryAfterSeconds),
      });
    }

    const user = await getVerifiedRequestUser(accessToken);
    if (accessToken && !user) return jsonMessage("登录状态已过期，请刷新后重试。", 401);
    if (user) {
      const userLimit = await consumeRateLimit(
        { scope: "product-feedback-user", limit: 10, windowSeconds: 3600 },
        user.id,
      );
      if (!userLimit.allowed) {
        return jsonMessage("反馈提交得有些频繁，请稍后再试。", 429, {
          "retry-after": String(userLimit.retryAfterSeconds),
        });
      }
    }

    const admin = getSupabaseServerAdminClient();
    const { error } = await admin.from("product_feedback").insert({
      user_id: user?.id ?? null,
      category: parsed.data.category,
      message: parsed.data.message,
      current_route: parsed.data.currentRoute,
      app_version: getAppVersion(),
    });
    if (error) throw error;

    return jsonMessage("感谢你的反馈，我们已经收到。", 201);
  } catch (error) {
    reportOperationalError(error, "product-feedback:submit");
    if (error instanceof RateLimitConfigurationError) {
      return jsonMessage("反馈服务尚未完成安全配置，请稍后再试。", 503);
    }
    return jsonMessage("反馈暂时没有提交成功，请稍后重试。", 503);
  }
}

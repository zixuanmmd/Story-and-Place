import "server-only";

import { getSupabaseServerAdminClient } from "@/lib/supabase/server-admin";
import { hashRateLimitIdentifier } from "@/lib/security/rate-limit-core";

export { getRequestClientIdentifier } from "@/lib/security/rate-limit-core";

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

export type RateLimitPolicy = {
  scope: string;
  limit: number;
  windowSeconds: number;
};

export class RateLimitConfigurationError extends Error {
  constructor() {
    super("Persistent rate limiting is not configured.");
    this.name = "RateLimitConfigurationError";
  }
}

export async function consumeRateLimit(
  policy: RateLimitPolicy,
  identifier: string,
): Promise<RateLimitResult> {
  const secret = process.env.RATE_LIMIT_SECRET;
  if (!secret || secret.length < 32) throw new RateLimitConfigurationError();

  const supabase = getSupabaseServerAdminClient();
  const { data, error } = await supabase.rpc("consume_server_rate_limit", {
    p_scope: policy.scope,
    p_key_hash: hashRateLimitIdentifier(policy.scope, identifier, secret),
    p_limit: policy.limit,
    p_window_seconds: policy.windowSeconds,
  });
  if (error) throw error;

  const result = data[0];
  if (!result) throw new Error("Rate limit function returned no result.");
  return {
    allowed: result.allowed,
    retryAfterSeconds: result.retry_after_seconds,
    remaining: result.remaining,
  };
}

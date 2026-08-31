import { createHmac } from "node:crypto";

export function getRequestClientIdentifier(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function hashRateLimitIdentifier(
  scope: string,
  identifier: string,
  secret: string,
) {
  return createHmac("sha256", secret)
    .update(scope)
    .update("\0")
    .update(identifier)
    .digest("hex");
}

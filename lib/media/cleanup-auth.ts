import { timingSafeEqual } from "node:crypto";

const MIN_SECRET_LENGTH = 32;

export function mediaCleanupSecretMatches(
  candidate: string | null,
  expected: string | undefined,
) {
  if (!candidate || !expected || expected.length < MIN_SECRET_LENGTH) return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isMediaCleanupRequestAuthorized(
  request: Request,
  environment: {
    mediaCleanupSecret?: string;
    cronSecret?: string;
  },
) {
  if (request.method === "GET") {
    const authorization = request.headers.get("authorization");
    const bearer = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : null;
    return mediaCleanupSecretMatches(bearer, environment.cronSecret);
  }

  if (request.method === "POST") {
    return mediaCleanupSecretMatches(
      request.headers.get("x-media-cleanup-secret"),
      environment.mediaCleanupSecret,
    );
  }

  return false;
}

import { z } from "zod";

const SAFE_TOKEN = /^[a-z0-9:_./-]+$/i;

function safeToken(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed && SAFE_TOKEN.test(trimmed) ? trimmed : fallback;
}

function errorProperty(error: unknown, key: string) {
  if (typeof error !== "object" || error === null) return undefined;
  return (error as Record<string, unknown>)[key];
}

export const safeMonitoringEventSchema = z.object({
  version: z.literal(1),
  kind: z.literal("operational_error"),
  context: z.string().min(1).max(120).regex(SAFE_TOKEN),
  errorName: z.string().min(1).max(80).regex(SAFE_TOKEN),
  errorCode: z.string().min(1).max(80).regex(SAFE_TOKEN).nullable(),
  status: z.number().int().min(100).max(599).nullable(),
  digest: z.string().min(1).max(120).regex(SAFE_TOKEN).nullable(),
  route: z.string().min(1).max(240).regex(/^\/[a-z0-9_./-]*$/i).nullable(),
  occurredAt: z.string().datetime(),
}).strict();

export type SafeMonitoringEvent = z.infer<typeof safeMonitoringEventSchema>;

export function normalizeMonitoringRoute(value: string | null | undefined) {
  if (!value) return null;
  const path = value.split("?", 1)[0]?.split("#", 1)[0] ?? "";
  return /^\/[a-z0-9_./-]*$/i.test(path) ? path.slice(0, 240) : null;
}

export function createSafeMonitoringEvent(
  error: unknown,
  context: string,
  route?: string | null,
): SafeMonitoringEvent {
  const statusValue = errorProperty(error, "status");
  const status = typeof statusValue === "number"
    && Number.isInteger(statusValue)
    && statusValue >= 100
    && statusValue <= 599
    ? statusValue
    : null;

  return {
    version: 1,
    kind: "operational_error",
    context: safeToken(context, "unknown", 120),
    errorName: safeToken(
      errorProperty(error, "name") ?? (error instanceof Error ? error.name : null),
      "UnknownError",
      80,
    ),
    errorCode: typeof errorProperty(error, "code") === "string"
      ? safeToken(errorProperty(error, "code"), "unknown", 80)
      : null,
    status,
    digest: typeof errorProperty(error, "digest") === "string"
      ? safeToken(errorProperty(error, "digest"), "unknown", 120)
      : null,
    route: normalizeMonitoringRoute(route),
    occurredAt: new Date().toISOString(),
  };
}

export function containsSensitiveMonitoringFields(value: unknown) {
  const serialized = JSON.stringify(value).toLocaleLowerCase("en-US");
  return [
    "message",
    "stack",
    "password",
    "access_token",
    "refresh_token",
    "latitude",
    "longitude",
    "content",
    "email",
  ].some((key) => serialized.includes(`\"${key}\"`));
}

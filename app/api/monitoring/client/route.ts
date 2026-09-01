import { consumeRateLimit, getRequestClientIdentifier } from "@/lib/security/rate-limit";
import { safeMonitoringEventSchema } from "@/lib/monitoring/safe-event";
import { getErrorMonitoringProvider } from "@/lib/monitoring/provider";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 4096;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  let event: unknown;
  try {
    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
    event = JSON.parse(body);
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = safeMonitoringEventSchema.safeParse(event);
  if (!parsed.success) return new Response(null, { status: 400 });

  try {
    const rateLimit = await consumeRateLimit(
      { scope: "client-monitoring", limit: 20, windowSeconds: 60 },
      getRequestClientIdentifier(request),
    );
    if (!rateLimit.allowed) return new Response(null, { status: 429 });
  } catch {
    // Monitoring must never break the user flow. When its persistence layer is
    // unavailable, fail silently without recording an unbounded public event.
    return new Response(null, { status: 204 });
  }

  await getErrorMonitoringProvider().capture({
    source: "story-and-place",
    channel: "client",
    ...parsed.data,
  });
  return new Response(null, { status: 204 });
}

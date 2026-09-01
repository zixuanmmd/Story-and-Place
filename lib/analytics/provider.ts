import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  productEventEnvelopeSchema,
  productEventPropertiesSchema,
  type ProductEventEnvelope,
  type ProductEventName,
  type ProductEventProperties,
} from "@/lib/analytics/events";
import type { Json } from "@/types/database";
import { reportOperationalError } from "@/lib/errors";

const ANALYTICS_SESSION_KEY = "story-map-product-session-v1";
const SESSION_STARTED_PREFIX = "story-map-session-started-v1";

export interface ProductAnalyticsProvider {
  track(event: ProductEventEnvelope): Promise<void>;
}

class SupabaseProductAnalyticsProvider implements ProductAnalyticsProvider {
  async track(rawEvent: ProductEventEnvelope) {
    const event = productEventEnvelopeSchema.parse(rawEvent);
    const { error } = await getSupabaseBrowserClient().rpc("track_product_event", {
      p_event_id: event.eventId,
      p_anonymous_session_id: event.anonymousSessionId,
      p_event_name: event.name,
      p_properties: event.properties as Json,
    });
    if (error) throw error;
  }
}

let provider: ProductAnalyticsProvider = new SupabaseProductAnalyticsProvider();

export function setProductAnalyticsProvider(nextProvider: ProductAnalyticsProvider) {
  provider = nextProvider;
}

export function getProductAnalyticsSessionId() {
  if (typeof window === "undefined") return crypto.randomUUID();
  try {
    const existing = window.sessionStorage.getItem(ANALYTICS_SESSION_KEY);
    if (existing && zodUuid(existing)) return existing;
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(ANALYTICS_SESSION_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

function zodUuid(value: string) {
  return productEventEnvelopeSchema.shape.anonymousSessionId.safeParse(value).success;
}

export async function trackProductEvent(
  name: ProductEventName,
  rawProperties: ProductEventProperties = {},
) {
  const properties = productEventPropertiesSchema.parse(rawProperties);
  await provider.track({
    eventId: crypto.randomUUID(),
    anonymousSessionId: getProductAnalyticsSessionId(),
    name,
    properties,
  });
}

export function recordProductEvent(
  name: ProductEventName,
  properties: ProductEventProperties = {},
) {
  void trackProductEvent(name, properties).catch((error: unknown) => {
    reportOperationalError(error, `product-analytics:${name}`);
  });
}

export function recordAuthenticatedSession(userId: string) {
  if (typeof window === "undefined") return;
  try {
    const sessionId = getProductAnalyticsSessionId();
    const guardKey = `${SESSION_STARTED_PREFIX}:${sessionId}:${userId}`;
    if (window.sessionStorage.getItem(guardKey)) return;
    window.sessionStorage.setItem(guardKey, "1");
    recordProductEvent("session_started", { source: "auth-provider" });
  } catch {
    // Analytics must never interfere with authentication when browser storage
    // is unavailable (for example, strict privacy mode).
  }
}

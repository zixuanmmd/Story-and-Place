import { describe, expect, it } from "vitest";
import {
  bucketResultCount,
  productEventEnvelopeSchema,
  productEventPropertiesSchema,
} from "./events";

const envelope = {
  eventId: "11111111-1111-4111-8111-111111111111",
  anonymousSessionId: "22222222-2222-4222-8222-222222222222",
  name: "search_used" as const,
  properties: { source: "global-search", result_count_bucket: "six_to_twenty" as const },
};

describe("privacy-bounded product analytics events", () => {
  it("accepts an allowlisted event with low-sensitivity scalar dimensions", () => {
    expect(productEventEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it.each([
    ["story body", { body: "a private story" }],
    ["story title", { title: "private title" }],
    ["search term", { query: "private search" }],
    ["coordinates", { latitude: 30.1, longitude: 104.1 }],
    ["email", { email: "private@example.invalid" }],
    ["token", { access_token: "secret" }],
    ["nested payload", { source: { route: "/private" } }],
  ])("rejects %s", (_label, properties) => {
    expect(productEventPropertiesSchema.safeParse(properties).success).toBe(false);
  });

  it("rejects unknown event names and arbitrary free text", () => {
    expect(productEventEnvelopeSchema.safeParse({ ...envelope, name: "story_body_saved" }).success).toBe(false);
    expect(productEventPropertiesSchema.safeParse({ source: "contains spaces and private prose" }).success).toBe(false);
  });

  it("uses bounded result-count buckets instead of exact search aggregates", () => {
    expect([0, 1, 6, 21].map(bucketResultCount)).toEqual([
      "zero", "one_to_five", "six_to_twenty", "over_twenty",
    ]);
  });
});

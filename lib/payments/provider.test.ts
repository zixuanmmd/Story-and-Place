import { describe, expect, it } from "vitest";
import { getPaymentProvider } from "@/lib/payments/provider";

describe("payment provider abstraction", () => {
  it("is explicitly disabled and never fabricates a checkout URL", async () => {
    const provider = getPaymentProvider();
    expect(provider.kind).toBe("disabled");
    expect(provider.configured).toBe(false);
    await expect(provider.createCheckoutSession({
      userId: "00000000-0000-4000-8000-000000000001",
      returnUrl: "https://example.invalid/settings/usage",
    })).resolves.toEqual({ available: false, reason: "payments_disabled" });
  });

  it("does not expose a fake customer portal", async () => {
    const provider = getPaymentProvider();
    await expect(provider.createCustomerPortalSession({
      userId: "00000000-0000-4000-8000-000000000001",
      returnUrl: "https://example.invalid/settings/usage",
    })).resolves.toEqual({ available: false, reason: "payments_disabled" });
  });
});

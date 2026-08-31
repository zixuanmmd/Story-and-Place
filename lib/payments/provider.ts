export type PaymentProviderKind = "disabled";

export type PaymentSessionRequest = {
  userId: string;
  returnUrl: string;
};

export type PaymentOperationResult =
  | { available: true; url: string }
  | { available: false; reason: "payments_disabled" };

export interface PaymentProvider {
  readonly kind: PaymentProviderKind;
  readonly configured: boolean;
  createCheckoutSession(request: PaymentSessionRequest): Promise<PaymentOperationResult>;
  createCustomerPortalSession(request: PaymentSessionRequest): Promise<PaymentOperationResult>;
}

class DisabledPaymentProvider implements PaymentProvider {
  readonly kind = "disabled" as const;
  readonly configured = false;

  async createCheckoutSession(
    request: PaymentSessionRequest,
  ): Promise<PaymentOperationResult> {
    void request;
    return { available: false, reason: "payments_disabled" };
  }

  async createCustomerPortalSession(
    request: PaymentSessionRequest,
  ): Promise<PaymentOperationResult> {
    void request;
    return { available: false, reason: "payments_disabled" };
  }
}

const disabledPaymentProvider = new DisabledPaymentProvider();

export function getPaymentProvider(): PaymentProvider {
  return disabledPaymentProvider;
}

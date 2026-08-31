import "server-only";

import type { Json, NotificationType } from "@/types/database";

export type NotificationEmailMessage = {
  outboxId: string;
  recipient: string;
  type: NotificationType;
  payload: Json;
};

export type EmailDeliveryResult =
  | { status: "sent"; providerMessageId: string }
  | { status: "skipped"; reason: "provider_not_configured" };

export interface EmailProvider {
  readonly name: string;
  send(message: NotificationEmailMessage): Promise<EmailDeliveryResult>;
}

class DevelopmentEmailProvider implements EmailProvider {
  readonly name = "development-stub";

  async send(_message: NotificationEmailMessage): Promise<EmailDeliveryResult> {
    void _message;
    return { status: "skipped", reason: "provider_not_configured" };
  }
}

let provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  provider ??= new DevelopmentEmailProvider();
  return provider;
}

export function setEmailProviderForTesting(nextProvider: EmailProvider | null) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Email provider overrides are test-only.");
  }
  provider = nextProvider;
}

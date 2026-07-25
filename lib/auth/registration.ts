export const EMAIL_CONFIRMATION_NOTICE =
  "注册成功。请前往邮箱完成验证后再登录。";

export const EMAIL_CONFIRMATION_CONFIGURATION_MISMATCH_NOTICE =
  "账户未能直接登录。请确认 Supabase 已开启 Email Provider，并关闭 Confirm Email。";

export const EMAIL_ALREADY_REGISTERED_NOTICE =
  "这个邮箱已经注册过了，请直接登录或使用其他邮箱。";

export const EMAIL_POSSIBLY_REGISTERED_NOTICE =
  "这个邮箱可能已经注册过了，请尝试登录或使用其他邮箱。";

type RegistrationIdentityLike = {
  provider?: string;
  email?: string;
  identity_data?: Record<string, unknown>;
};

export type RegistrationUserLike = {
  identities?: RegistrationIdentityLike[] | null;
} | null;

export type RegistrationOutcome =
  | { kind: "signed-in"; notice: null; shouldNavigate: true }
  | {
      kind:
        | "confirmation-required"
        | "configuration-mismatch"
        | "possibly-registered";
      notice: string;
      shouldNavigate: false;
    };

export function hasValidEmailIdentity(user: RegistrationUserLike) {
  return Boolean(
    user?.identities?.some(
      (identity) =>
        identity.provider === "email" &&
        ((typeof identity.email === "string" && identity.email.length > 0) ||
          (typeof identity.identity_data?.email === "string" &&
            identity.identity_data.email.length > 0)),
    ),
  );
}

export function resolveRegistrationOutcome(
  result: {
    hasSession: boolean;
    user: RegistrationUserLike;
    emailConfirmationRequired: boolean;
  },
): RegistrationOutcome {
  if (result.hasSession) {
    return { kind: "signed-in", notice: null, shouldNavigate: true };
  }

  if (result.user && !hasValidEmailIdentity(result.user)) {
    return {
      kind: "possibly-registered",
      notice: EMAIL_POSSIBLY_REGISTERED_NOTICE,
      shouldNavigate: false,
    };
  }

  if (result.emailConfirmationRequired) {
    return {
      kind: "confirmation-required",
      notice: EMAIL_CONFIRMATION_NOTICE,
      shouldNavigate: false,
    };
  }

  return {
    kind: "configuration-mismatch",
    notice: EMAIL_CONFIRMATION_CONFIGURATION_MISMATCH_NOTICE,
    shouldNavigate: false,
  };
}

function getErrorField(error: unknown, field: string) {
  if (typeof error !== "object" || error === null) return null;
  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" ? value : null;
}

export function isDuplicateEmailError(error: unknown) {
  const code = getErrorField(error, "code");
  if (code === "email_exists" || code === "user_already_exists") return true;

  const message = getErrorField(error, "message")?.toLocaleLowerCase("en-US");
  return Boolean(message?.includes("user already registered"));
}

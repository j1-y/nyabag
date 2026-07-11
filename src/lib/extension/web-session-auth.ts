import "server-only";

import { createAdminServiceClient } from "@/lib/admin/service";
import { createExtensionAuthClient } from "@/lib/extension/auth";
import {
  buildExtensionLoginRedirectUrl,
  consumeExtensionExchangeCode as consumeExtensionExchangeCodeCore,
  createExtensionExchangeCode as createExtensionExchangeCodeCore,
  createExtensionSessionForConsumedCode as createExtensionSessionForConsumedCodeCore,
  generateExtensionExchangeCode,
  getAllowedChromeExtensionIds,
  hashExtensionExchangeCode,
  isValidExtensionExchangeCode,
  validateChromeIdentityRedirectUri,
  validateExtensionAuthState,
} from "@/lib/extension/web-session-auth-core";

export type { ConsumedExtensionAuthCode } from "@/lib/extension/web-session-auth-core";
export {
  buildExtensionLoginRedirectUrl,
  generateExtensionExchangeCode,
  getAllowedChromeExtensionIds,
  hashExtensionExchangeCode,
  isValidExtensionExchangeCode,
  validateChromeIdentityRedirectUri,
  validateExtensionAuthState,
};

export async function createExtensionExchangeCode({
  userId,
  email,
  redirectUri,
  state,
}: {
  userId: string;
  email: string;
  redirectUri: string;
  state: string;
}) {
  return createExtensionExchangeCodeCore({
    userId,
    email,
    redirectUri,
    state,
    supabaseClient: createAdminServiceClient(),
  });
}

export async function consumeExtensionExchangeCode({
  code,
  redirectUri,
}: {
  code: string;
  redirectUri: string;
}) {
  return consumeExtensionExchangeCodeCore({
    code,
    redirectUri,
    supabaseClient: createAdminServiceClient(),
  });
}

export async function createExtensionSessionForConsumedCode(
  code: Parameters<typeof createExtensionSessionForConsumedCodeCore>[0]
) {
  return createExtensionSessionForConsumedCodeCore(code, {
    admin: createAdminServiceClient(),
    auth: createExtensionAuthClient(),
  });
}

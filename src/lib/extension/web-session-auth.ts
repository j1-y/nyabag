import "server-only";

import crypto from "node:crypto";
import { createAdminServiceClient } from "@/lib/admin/service";
import { createExtensionAuthClient } from "@/lib/extension/auth";

const CODE_TTL_SECONDS = 5 * 60;
const CHROME_EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const EXCHANGE_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const STATE_PATTERN = /^[A-Za-z0-9._~-]{16,256}$/;

type ValidationResult =
  | { success: true; value: string }
  | { success: false; status: number; error: string };

export type ConsumedExtensionAuthCode = {
  user_id: string;
  email: string;
  redirect_uri: string;
  state: string;
  expires_at: string;
};

export function validateChromeIdentityRedirectUri(
  value: string | null | undefined
): ValidationResult {
  const redirectUri = value?.trim();

  if (!redirectUri) {
    return {
      success: false,
      status: 400,
      error: "redirect_uri is required",
    };
  }

  const allowedIds = getAllowedChromeExtensionIds();

  if (!allowedIds.success) {
    return allowedIds;
  }

  let parsed: URL;

  try {
    parsed = new URL(redirectUri);
  } catch {
    return {
      success: false,
      status: 400,
      error: "Invalid redirect_uri",
    };
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.pathname !== "/nyabag-auth" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    return {
      success: false,
      status: 400,
      error: "Invalid Chrome identity redirect_uri",
    };
  }

  const allowedHosts = new Set(
    allowedIds.value.map((id) => `${id}.chromiumapp.org`)
  );

  if (!allowedHosts.has(parsed.hostname.toLowerCase())) {
    return {
      success: false,
      status: 400,
      error: "Unauthorized Chrome identity redirect_uri",
    };
  }

  return { success: true, value: parsed.toString() };
}

export function validateExtensionAuthState(
  value: string | null | undefined
): ValidationResult {
  const state = value?.trim();

  if (!state) {
    return { success: false, status: 400, error: "state is required" };
  }

  if (!STATE_PATTERN.test(state)) {
    return {
      success: false,
      status: 400,
      error: "Invalid state",
    };
  }

  return { success: true, value: state };
}

export function isValidExtensionExchangeCode(value: string) {
  return EXCHANGE_CODE_PATTERN.test(value);
}

export function generateExtensionExchangeCode() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashExtensionExchangeCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

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
  const code = generateExtensionExchangeCode();
  const codeHash = hashExtensionExchangeCode(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString();
  const supabase = createAdminServiceClient();

  const { error } = await supabase.from("extension_auth_codes").insert({
    code_hash: codeHash,
    user_id: userId,
    email,
    redirect_uri: redirectUri,
    state,
    expires_at: expiresAt,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { code, expiresAt };
}

export async function consumeExtensionExchangeCode({
  code,
  redirectUri,
}: {
  code: string;
  redirectUri: string;
}) {
  const codeHash = hashExtensionExchangeCode(code);
  const now = new Date().toISOString();
  const supabase = createAdminServiceClient();

  const { data, error } = await supabase
    .from("extension_auth_codes")
    .update({ consumed_at: now })
    .eq("code_hash", codeHash)
    .eq("redirect_uri", redirectUri)
    .is("consumed_at", null)
    .gt("expires_at", now)
    .select("user_id,email,redirect_uri,state,expires_at")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as ConsumedExtensionAuthCode | null;
}

export async function createExtensionSessionForConsumedCode(
  code: ConsumedExtensionAuthCode
) {
  const admin = createAdminServiceClient();
  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: code.email,
    });

  if (
    linkError ||
    !linkData.properties?.hashed_token ||
    !linkData.user?.id
  ) {
    throw new Error(linkError?.message ?? "Could not generate auth token");
  }

  if (linkData.user.id !== code.user_id) {
    throw new Error("Generated auth token user mismatch");
  }

  const auth = createExtensionAuthClient();
  const { data, error } = await auth.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });

  if (error || !data.session || !data.user) {
    throw new Error(error?.message ?? "Could not verify auth token");
  }

  if (data.user.id !== code.user_id) {
    throw new Error("Verified session user mismatch");
  }

  return {
    user: {
      id: data.user.id,
      email: data.user.email || code.email,
    },
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
    },
  };
}

function getAllowedChromeExtensionIds():
  | { success: true; value: string[] }
  | { success: false; status: number; error: string } {
  const configured = process.env.NYABAG_CHROME_EXTENSION_IDS;

  if (!configured?.trim()) {
    return {
      success: false,
      status: 500,
      error: "NYABAG_CHROME_EXTENSION_IDS is not configured",
    };
  }

  const ids = configured
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);

  if (!ids.length || ids.some((id) => !CHROME_EXTENSION_ID_PATTERN.test(id))) {
    return {
      success: false,
      status: 500,
      error: "NYABAG_CHROME_EXTENSION_IDS is invalid",
    };
  }

  return { success: true, value: ids };
}

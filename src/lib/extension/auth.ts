import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import type { NextRequest } from "next/server";

export type ExtensionUserAuthResult =
  | {
      success: true;
      user: {
        id: string;
        email?: string;
      };
      accessToken: string;
    }
  | {
      success: false;
      status: number;
      error: string;
      code: "AUTH_MISSING_ACCESS_TOKEN" | "AUTH_INVALID_SESSION" | "AUTH_SERVER_CONFIG" | "AUTH_PROVIDER_UNAVAILABLE";
      details?: { requestId: string; providerReason?: string };
    };

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function safeProviderReason(value: unknown) {
  const reason = value instanceof Error ? value.message : String(value ?? "Authentication provider request failed");
  return reason
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, "[redacted token]")
    .slice(0, 300);
}

export function createExtensionAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase public environment variables are not configured");
  }

  return createSupabaseClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function authenticateExtensionUser(
  request: NextRequest
): Promise<ExtensionUserAuthResult> {
  const accessToken = getBearerToken(request);
  const requestId = crypto.randomUUID();

  if (!accessToken) {
    return {
      success: false,
      status: 401,
      error: "Missing access token",
      code: "AUTH_MISSING_ACCESS_TOKEN",
      details: { requestId },
    };
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return {
      success: false,
      status: 500,
      error: "Extension authentication is not configured",
      code: "AUTH_SERVER_CONFIG",
      details: { requestId, providerReason: "NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing" },
    };
  }

  try {
    const supabase = createExtensionAuthClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      return {
        success: false,
        status: 401,
        error: "Invalid or expired session",
        code: "AUTH_INVALID_SESSION",
        details: { requestId, providerReason: safeProviderReason(error?.message) },
      };
    }

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
      },
      accessToken,
    };
  } catch (error) {
    return {
      success: false,
      status: 502,
      error: "Could not verify extension session with the authentication provider",
      code: "AUTH_PROVIDER_UNAVAILABLE",
      details: {
        requestId,
        providerReason: safeProviderReason(error),
      },
    };
  }
}

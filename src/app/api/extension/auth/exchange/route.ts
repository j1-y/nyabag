import { NextRequest, NextResponse } from "next/server";
import { extensionCors, handleExtensionPreflight } from "@/lib/extension/cors";
import {
  consumeExtensionExchangeCode,
  createExtensionSessionForConsumedCode,
  isValidExtensionExchangeCode,
  validateChromeIdentityRedirectUri,
} from "@/lib/extension/web-session-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ExchangePayload = {
  code?: unknown;
  redirectUri?: unknown;
};

export function OPTIONS(request: NextRequest) {
  return handleExtensionPreflight(request);
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  let body: ExchangePayload;

  try {
    body = (await request.json()) as ExchangePayload;
  } catch {
    return corsJson({ error: "Invalid JSON payload" }, 400, origin);
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  const redirectUri =
    typeof body.redirectUri === "string" ? body.redirectUri.trim() : "";

  if (!code || !redirectUri) {
    return corsJson(
      { error: "code and redirectUri are required" },
      400,
      origin
    );
  }

  if (!isValidExtensionExchangeCode(code)) {
    return corsJson({ error: "Invalid authorization code" }, 400, origin);
  }

  const redirectResult = validateChromeIdentityRedirectUri(redirectUri);

  if (!redirectResult.success) {
    return corsJson({ error: redirectResult.error }, redirectResult.status, origin);
  }

  try {
    const consumed = await consumeExtensionExchangeCode({
      code,
      redirectUri: redirectResult.value,
    });

    if (!consumed) {
      return corsJson(
        { error: "Invalid or expired authorization code" },
        400,
        origin
      );
    }

    const session = await createExtensionSessionForConsumedCode(consumed);
    return corsJson(session, 200, origin);
  } catch (error) {
    console.error(
      "[extension-auth-exchange] exchange failed:",
      error instanceof Error ? error.message : error
    );
    return corsJson(
      { error: "Could not create extension session" },
      500,
      origin
    );
  }
}

function corsJson(body: unknown, status: number, origin: string | null) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return extensionCors(response, origin);
}

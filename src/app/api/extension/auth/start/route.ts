import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildExtensionLoginRedirectUrl,
  createExtensionExchangeCode,
  validateChromeIdentityRedirectUri,
  validateExtensionAuthState,
} from "@/lib/extension/web-session-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const redirectResult = validateChromeIdentityRedirectUri(
    request.nextUrl.searchParams.get("redirect_uri")
  );

  if (!redirectResult.success) {
    return jsonError(redirectResult.error, redirectResult.status);
  }

  const stateResult = validateExtensionAuthState(
    request.nextUrl.searchParams.get("state")
  );

  if (!stateResult.success) {
    return jsonError(stateResult.error, stateResult.status);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return noStore(NextResponse.redirect(buildExtensionLoginRedirectUrl(request.nextUrl)));
  }

  const email = user.email?.trim();

  if (!email) {
    return jsonError("Authenticated account does not have an email", 400);
  }

  try {
    const { code } = await createExtensionExchangeCode({
      userId: user.id,
      email,
      redirectUri: redirectResult.value,
      state: stateResult.value,
    });

    const callbackUrl = new URL(redirectResult.value);
    callbackUrl.searchParams.set("code", code);
    callbackUrl.searchParams.set("state", stateResult.value);

    return noStore(NextResponse.redirect(callbackUrl));
  } catch (error) {
    console.error(
      "[extension-auth-start] code creation failed:",
      error instanceof Error ? error.message : error
    );
    return jsonError("Could not create extension authorization code", 500);
  }
}

function jsonError(error: string, status: number) {
  return noStore(NextResponse.json({ error }, { status }));
}

function noStore<T extends NextResponse>(response: T) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

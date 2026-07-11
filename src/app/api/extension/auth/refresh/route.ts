import { NextRequest, NextResponse } from "next/server";
import { createExtensionAuthClient } from "@/lib/extension/auth";
import { extensionCors, handleExtensionPreflight } from "@/lib/extension/cors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: NextRequest) {
  return handleExtensionPreflight(request);
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  let body: { refreshToken?: string };

  try {
    body = await request.json();
  } catch {
    return extensionCors(
      NextResponse.json({ error: "Invalid JSON payload", code: "AUTH_INVALID_REFRESH_REQUEST" }, { status: 400 }),
      origin
    );
  }

  const refreshToken = body.refreshToken?.trim();

  if (!refreshToken) {
    return extensionCors(
      NextResponse.json(
        { error: "Refresh token is required", code: "AUTH_MISSING_REFRESH_TOKEN" },
        { status: 400 }
      ),
      origin
    );
  }

  const supabase = createExtensionAuthClient();
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.session || !data.user) {
    return extensionCors(
      NextResponse.json(
        { error: error?.message ?? "Could not refresh session", code: "AUTH_REFRESH_FAILED" },
        { status: 401 }
      ),
      origin
    );
  }

  return extensionCors(
    NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
        token_type: data.session.token_type,
      },
    }),
    origin
  );
}

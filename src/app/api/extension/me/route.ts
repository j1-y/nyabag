import { NextRequest, NextResponse } from "next/server";
import { createAdminServiceClient } from "@/lib/admin/service";
import { authenticateExtensionUser } from "@/lib/extension/auth";
import { extensionCors, handleExtensionPreflight } from "@/lib/extension/cors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: NextRequest) {
  return handleExtensionPreflight(request);
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const auth = await authenticateExtensionUser(request);

  if (!auth.success) {
    return extensionCors(
      NextResponse.json({ error: auth.error, code: auth.code, details: auth.details }, { status: auth.status }),
      origin
    );
  }

  const supabase = createAdminServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("name,email")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  return extensionCors(
    NextResponse.json({
      user: {
        id: auth.user.id,
        email: profile?.email || auth.user.email || "",
        name: profile?.name || "",
      },
    }),
    origin
  );
}

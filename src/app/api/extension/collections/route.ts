import { NextRequest, NextResponse } from "next/server";
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

  // MVP: return Inbox only. Replace with real Bags/Collections once the DB table exists.
  return extensionCors(
    NextResponse.json({
      collections: [
        {
          id: null,
          name: "Inbox",
          itemCount: null,
          color: "#f5f0df",
        },
      ],
    }),
    origin
  );
}

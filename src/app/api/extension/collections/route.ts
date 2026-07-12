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

  const service = createAdminServiceClient();
  const { data: memberships } = await service
    .from("workspace_members")
    .select("role,workspaces(*)")
    .eq("user_id", auth.user.id);

  const workspaces = (memberships ?? [])
    .map((membership) => {
      const workspace = Array.isArray(membership.workspaces)
        ? membership.workspaces[0]
        : membership.workspaces;
      if (!workspace) return null;
      return {
        id: workspace.id,
        name: workspace.name,
        role: membership.role,
      };
    })
    .filter(Boolean);

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
      workspaces,
    }),
    origin
  );
}

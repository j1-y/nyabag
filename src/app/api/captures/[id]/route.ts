import { NextRequest, NextResponse } from "next/server";
import { createAdminServiceClient } from "@/lib/admin/service";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspaces";

const CAPTURES_BUCKET = "captures";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const workspaceContext = await getWorkspaceContext(supabase, user);
  const activeWorkspaceId = workspaceContext.activeWorkspace.id;

  const service = createAdminServiceClient();
  const { data: capture, error: fetchError } = await service
    .from("captures")
    .select("id,path")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("workspace_id", activeWorkspaceId)
    .single();

  if (fetchError || !capture) {
    return NextResponse.json({ error: "Capture not found" }, { status: 404 });
  }

  if (capture.path) {
    const { error: storageError } = await service.storage
      .from(CAPTURES_BUCKET)
      .remove([capture.path]);

    if (storageError) {
      console.warn("[captures/delete] storage remove failed:", storageError.message);
    }
  }

  const { error: deleteError } = await service
    .from("captures")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("workspace_id", activeWorkspaceId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

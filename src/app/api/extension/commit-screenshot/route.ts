import { NextRequest, NextResponse } from "next/server";
import { createAdminServiceClient } from "@/lib/admin/service";
import { authenticateExtensionUser } from "@/lib/extension/auth";
import { BOOKMARK_SCREENSHOT_BUCKET } from "@/lib/bookmarks/storage";
import { extensionCors, handleExtensionPreflight } from "@/lib/extension/cors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: NextRequest) {
  return handleExtensionPreflight(request);
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const auth = await authenticateExtensionUser(request);

  if (!auth.success) {
    return extensionCors(
      NextResponse.json({ error: auth.error }, { status: auth.status }),
      origin
    );
  }

  let body: { bookmarkId?: string; path?: string };
  try {
    body = await request.json();
  } catch {
    return extensionCors(
      NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 }),
      origin
    );
  }

  const bookmarkId = body.bookmarkId?.trim();
  const path = body.path?.trim();

  if (!bookmarkId || !path) {
    return extensionCors(
      NextResponse.json(
        { error: "bookmarkId and path are required" },
        { status: 400 }
      ),
      origin
    );
  }

  // Prevent path traversal — path must start with the user's own ID prefix
  if (!path.startsWith(`${auth.user.id}/`)) {
    return extensionCors(
      NextResponse.json({ error: "Invalid storage path" }, { status: 403 }),
      origin
    );
  }

  const supabase = createAdminServiceClient();

  // Verify the bookmark belongs to the authenticated user
  const { data: bookmark, error: lookupError } = await supabase
    .from("bookmarks")
    .select("id, user_id")
    .eq("id", bookmarkId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (lookupError) {
    return extensionCors(
      NextResponse.json({ error: lookupError.message }, { status: 500 }),
      origin
    );
  }

  if (!bookmark) {
    return extensionCors(
      NextResponse.json({ error: "Bookmark not found" }, { status: 404 }),
      origin
    );
  }

  // Get the public URL for the uploaded screenshot
  const { data: publicUrlData } = supabase.storage
    .from(BOOKMARK_SCREENSHOT_BUCKET)
    .getPublicUrl(path);

  const screenshotUrl = publicUrlData?.publicUrl ?? null;

  // Commit: write the path and public URL back to the bookmark row
  const { error: updateError } = await supabase
    .from("bookmarks")
    .update({
      screenshot_path: path,
      screenshot_url: screenshotUrl,
      screenshot_refreshed_at: new Date().toISOString(),
      processing_status: "ready",
    })
    .eq("id", bookmarkId)
    .eq("user_id", auth.user.id);

  if (updateError) {
    console.error("[commit-screenshot] update failed:", updateError.message);
    return extensionCors(
      NextResponse.json({ error: updateError.message }, { status: 500 }),
      origin
    );
  }

  return extensionCors(
    NextResponse.json({ success: true, screenshotUrl }),
    origin
  );
}

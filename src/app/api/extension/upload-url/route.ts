import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminServiceClient } from "@/lib/admin/service";
import { authenticateExtensionUser } from "@/lib/extension/auth";
import { BOOKMARK_SCREENSHOT_BUCKET } from "@/lib/bookmarks/storage";
import { extensionCors, handleExtensionPreflight } from "@/lib/extension/cors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: NextRequest) {
  return handleExtensionPreflight(request);
}

// 60-second signed upload URL — the extension uploads directly to Supabase Storage
const UPLOAD_URL_TTL_SECONDS = 60;

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const auth = await authenticateExtensionUser(request);

  if (!auth.success) {
    return extensionCors(
      NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status }),
      origin
    );
  }

  let body: { bookmarkId?: string };
  try {
    body = await request.json();
  } catch {
    return extensionCors(
      NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 }),
      origin
    );
  }

  const bookmarkId = body.bookmarkId?.trim();
  if (!bookmarkId) {
    return extensionCors(
      NextResponse.json({ error: "bookmarkId is required" }, { status: 400 }),
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

  // Generate a unique path for the screenshot
  const path = `${auth.user.id}/${bookmarkId}/${crypto.randomUUID()}.jpg`;

  const { data: signedData, error: signedError } = await supabase.storage
    .from(BOOKMARK_SCREENSHOT_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });

  if (signedError || !signedData?.signedUrl) {
    console.error("[upload-url] createSignedUploadUrl failed:", signedError?.message);
    return extensionCors(
      NextResponse.json(
        { error: signedError?.message ?? "Could not generate upload URL" },
        { status: 500 }
      ),
      origin
    );
  }

  return extensionCors(
    NextResponse.json({
      uploadUrl: signedData.signedUrl,
      path,
    }),
    origin
  );
}

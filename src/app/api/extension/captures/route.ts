import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import sharp from "sharp";
import { createAdminServiceClient } from "@/lib/admin/service";
import { authenticateExtensionUser } from "@/lib/extension/auth";
import { checkRateLimit, userLimitKey } from "@/lib/rate-limit";
import { extensionCors, handleExtensionPreflight } from "@/lib/extension/cors";
import {
  createBookmarkCaptureResponse,
  type ExtensionBookmarkCapturePayload,
} from "@/lib/extension/create-bookmark-capture";
import { classifyExtensionCapture } from "@/lib/extension/capture-dispatch";
import { resolveWorkspaceForUser } from "@/lib/workspaces";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: NextRequest) {
  return handleExtensionPreflight(request);
}

const CAPTURES_BUCKET = "captures";
const MAX_WIDTH = 1600;
const JPEG_QUALITY = 75;
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const SIGNED_URL_TTL = 365 * 24 * 60 * 60;

type UnifiedCapturePayload = ExtensionBookmarkCapturePayload & {
  mimeType?: string;
  workspaceId?: string | null;
};

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const auth = await authenticateExtensionUser(request);
  if (!auth.success) {
    return extensionCors(
      NextResponse.json({ error: auth.error, code: auth.code, details: auth.details }, { status: auth.status }),
      origin
    );
  }

  let body: UnifiedCapturePayload;

  try {
    body = await request.json();
  } catch {
    return extensionCors(
      NextResponse.json({ error: "Invalid JSON payload", code: "CAPTURE_INVALID_JSON" }, { status: 400 }),
      origin
    );
  }

  const dispatch = classifyExtensionCapture(body);
  if (dispatch.kind === "error") {
    return extensionCors(
      NextResponse.json({ error: dispatch.error, code: dispatch.code }, { status: dispatch.status }),
      origin
    );
  }

  if (dispatch.kind === "bookmark") {
    return createBookmarkCaptureResponse({ payload: body, auth, origin });
  }

  const rate = await checkRateLimit({
    scope: "extension-captures",
    identifier: userLimitKey(auth.user.id),
    limit: 120,
    windowSeconds: 60 * 60,
  });
  if (!rate.allowed) {
    return extensionCors(
      NextResponse.json({ error: "Capture limit reached. Please try again later." }, { status: 429 }),
      origin
    );
  }

  const { imageBase64, pageUrl, pageTitle, source = "extension" } = body;
  if (!imageBase64) {
    return extensionCors(
      NextResponse.json({ error: "Screenshot image data is required", code: "SCREENSHOT_IMAGE_REQUIRED" }, { status: 400 }),
      origin
    );
  }

  const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, "");
  const inputBuffer = Buffer.from(base64Data, "base64");

  if (inputBuffer.byteLength > MAX_INPUT_BYTES) {
    return extensionCors(
      NextResponse.json({ error: "Image too large (max 15 MB)" }, { status: 413 }),
      origin
    );
  }

  const originalSize = inputBuffer.byteLength;

  // ── Compress with sharp ──────────────────────────────────────────────────────
  let compressed: Buffer;
  try {
    compressed = await sharp(inputBuffer)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    console.error("[captures] sharp compression failed:", err);
    return extensionCors(
      NextResponse.json({ error: "Image processing failed" }, { status: 500 }),
      origin
    );
  }

  // ── Upload to Supabase Storage ───────────────────────────────────────────────
  const path = `${auth.user.id}/${crypto.randomUUID()}.jpg`;
  const supabase = createAdminServiceClient();
  const resolvedWorkspace = await resolveWorkspaceForUser(
    supabase,
    auth.user.id,
    body.workspaceId ?? null
  );

  if (!resolvedWorkspace) {
    return extensionCors(
      NextResponse.json(
        { error: "Workspace not found", code: body.workspaceId ? "WORKSPACE_ACCESS_DENIED" : "WORKSPACE_NOT_FOUND" },
        { status: 404 }
      ),
      origin
    );
  }

  const { error: uploadError } = await supabase.storage
    .from(CAPTURES_BUCKET)
    .upload(path, compressed, { contentType: "image/jpeg", upsert: false });

  if (uploadError) {
    console.error("[captures] storage upload failed:", uploadError.message);
    return extensionCors(
      NextResponse.json({ error: uploadError.message ?? "Storage upload failed" }, { status: 500 }),
      origin
    );
  }

  // ── Signed URL (1-year) ──────────────────────────────────────────────────────
  const { data: signedData } = await supabase.storage
    .from(CAPTURES_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);

  const captureUrl = signedData?.signedUrl ?? null;
  const compressedSize = compressed.byteLength;
  const savings = Math.round((1 - compressedSize / originalSize) * 100);

  // ── Persist metadata to the captures table ───────────────────────────────────
  const { data: capture, error: insertError } = await supabase
    .from("captures")
    .insert({
      user_id: auth.user.id,
      workspace_id: resolvedWorkspace.workspace.id,
      path,
      capture_url: captureUrl,
      page_url: pageUrl ?? null,
      page_title: pageTitle ?? null,
      original_size: originalSize,
      compressed_size: compressedSize,
      source,
    })
    .select()
    .single();

  if (insertError) {
    // Non-fatal: image is already in storage; log but continue
    console.warn("[captures] DB insert failed (non-fatal):", insertError.message);
  }

  console.log(
    `[captures] saved ${path} — ${originalSize} → ${compressedSize} bytes (${savings}% smaller)`,
    pageUrl ? `| ${pageUrl}` : ""
  );

  return extensionCors(
    NextResponse.json({
      success: true,
      captureUrl,
      path,
      id: capture?.id ?? null,
      pageUrl: pageUrl ?? null,
      pageTitle: pageTitle ?? null,
      originalSize,
      compressedSize,
      savings: `${savings}%`,
    }),
    origin
  );
}

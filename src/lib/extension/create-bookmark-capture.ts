import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminServiceClient } from "@/lib/admin/service";
import type { ExtensionUserAuthResult } from "@/lib/extension/auth";
import { validatePublicHttpUrl } from "@/lib/security/url-safety";
import { checkRateLimit, userLimitKey } from "@/lib/rate-limit";
import { getDesignData, getDomain } from "@/lib/data";
import { triggerBookmarkProcessor } from "@/lib/bookmarks/trigger-processor";
import { extensionCors } from "@/lib/extension/cors";
import { resolveWorkspaceForUser } from "@/lib/workspaces";
import { EXTENSION_CAPTURE_ATTRIBUTION } from "@/lib/bookmarks/format-note";

type ExtensionCaptureType =
  | "page"
  | "image"
  | "link"
  | "selection"
  | "visible_screenshot"
  | "full_page_screenshot";

export type ExtensionBookmarkCapturePayload = {
  type?: ExtensionCaptureType;
  url?: string;
  pageUrl?: string;
  pageTitle?: string;
  text?: string;
  imageBase64?: string;
  collectionId?: string | null;
  workspaceId?: string | null;
  source?: string;
  /** Set by the extension when it has already uploaded a screenshot via upload-url/commit-screenshot */
  hasExtensionScreenshot?: boolean;
};

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function getFilenameFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last).slice(0, 120) : "";
  } catch {
    return "";
  }
}

function getTitleForCapture(payload: ExtensionBookmarkCapturePayload, safeTargetUrl: string) {
  const domain = getDomain(safeTargetUrl);
  const pageTitle = payload.pageTitle?.trim();

  if (payload.type === "image") {
    return (
      getFilenameFromUrl(safeTargetUrl) ||
      (domain ? `Image from ${domain}` : "Saved image")
    );
  }

  if (payload.type === "selection") {
    const text = payload.text?.trim() ?? "";
    if (text) return truncate(text.replace(/\s+/g, " "), 80);
    return pageTitle || (domain ? `Selection from ${domain}` : "Saved selection");
  }

  if (payload.type === "visible_screenshot" || payload.type === "full_page_screenshot") {
    return pageTitle || (domain ? `Screenshot from ${domain}` : "Visible screenshot");
  }

  return pageTitle || (domain ? domain.charAt(0).toUpperCase() + domain.slice(1) : safeTargetUrl);
}

function getNoteForCapture(payload: ExtensionBookmarkCapturePayload, safePageUrl?: string) {
  if (payload.type === "selection") {
    const text = truncate(payload.text?.trim() ?? "", 1800);
    return [text, "", safePageUrl ? `Source: ${safePageUrl}` : "", EXTENSION_CAPTURE_ATTRIBUTION]
      .filter(Boolean)
      .join("\n");
  }

  if (payload.type === "image") {
    return [safePageUrl ? `Source page: ${safePageUrl}` : "", EXTENSION_CAPTURE_ATTRIBUTION]
      .filter(Boolean)
      .join("\n");
  }

  if (payload.type === "visible_screenshot") {
    return [
      "Visible tab screenshot capture requested from Chrome extension.",
      "MVP note: the source page is saved and normal preview processing is queued.",
      safePageUrl ? `Source page: ${safePageUrl}` : "",
      EXTENSION_CAPTURE_ATTRIBUTION,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return EXTENSION_CAPTURE_ATTRIBUTION;
}

async function enqueueBookmarkProcessingJob({
  supabase,
  bookmarkId,
  userId,
  workspaceId,
  url,
}: {
  supabase: ReturnType<typeof createAdminServiceClient>;
  bookmarkId: string;
  userId: string;
  workspaceId: string;
  url: string;
}) {
  const { error } = await supabase.rpc("enqueue_bookmark_processing_job", {
    p_bookmark_id: bookmarkId,
    p_user_id: userId,
    p_workspace_id: workspaceId,
    p_url: url,
  });

  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

async function triggerProcessorBestEffort() {
  const result = await triggerBookmarkProcessor();
  if (!result.success) {
    console.error("[extension-capture] Processor trigger failed:", result.error);
  }
}

export async function createBookmarkCaptureResponse({
  payload,
  auth,
  origin,
}: {
  payload: ExtensionBookmarkCapturePayload;
  auth: Extract<ExtensionUserAuthResult, { success: true }>;
  origin: string | null;
}) {
  const rate = await checkRateLimit({
    scope: "extension-capture",
    identifier: userLimitKey(auth.user.id),
    limit: 80,
    windowSeconds: 60 * 60,
  });

  if (!rate.allowed) {
    return extensionCors(
      NextResponse.json(
        { error: "Extension capture limit reached. Please try again later." },
        { status: 429 }
      ),
      origin
    );
  }

  const type = payload.type;

  if (!type) {
    return extensionCors(
      NextResponse.json({ error: "Capture type is required", code: "CAPTURE_TYPE_REQUIRED" }, { status: 400 }),
      origin
    );
  }

  const targetUrl =
    type === "selection" || type === "visible_screenshot" || type === "full_page_screenshot"
      ? payload.pageUrl
      : payload.url;

  if (!targetUrl) {
    return extensionCors(
      NextResponse.json({ error: "A valid URL is required", code: "CAPTURE_URL_REQUIRED" }, { status: 400 }),
      origin
    );
  }

  const safeTargetUrl = await validatePublicHttpUrl(targetUrl);

  if (!safeTargetUrl.safe) {
    return extensionCors(
      NextResponse.json({ error: safeTargetUrl.error }, { status: 400 }),
      origin
    );
  }

  let safePageUrl: string | undefined;

  if (payload.pageUrl && payload.pageUrl !== targetUrl) {
    const pageUrlResult = await validatePublicHttpUrl(payload.pageUrl);
    if (pageUrlResult.safe) safePageUrl = pageUrlResult.url;
  } else if (payload.pageUrl) {
    safePageUrl = safeTargetUrl.url;
  }

  const supabase = createAdminServiceClient();
  const resolvedWorkspace = await resolveWorkspaceForUser(
    supabase,
    auth.user.id,
    payload.workspaceId ?? null
  );

  if (!resolvedWorkspace) {
    return extensionCors(
      NextResponse.json(
        { error: "Workspace not found", code: payload.workspaceId ? "WORKSPACE_ACCESS_DENIED" : "WORKSPACE_NOT_FOUND" },
        { status: 404 }
      ),
      origin
    );
  }

  const workspaceId = resolvedWorkspace.workspace.id;
  const bookmarkId = crypto.randomUUID();
  const designData = getDesignData(safeTargetUrl.url);
  const domain = getDomain(safeTargetUrl.url);
  const isImageCapture = type === "image";

  const title = getTitleForCapture(payload, safeTargetUrl.url);
  const note = getNoteForCapture(payload, safePageUrl);

  const tags = Array.from(
    new Set(
      [
        "extension",
        type === "visible_screenshot" ? "screenshot" : type,
        domain ? domain.replace(/[^a-z0-9]+/gi, "-").toLowerCase() : "",
      ].filter(Boolean)
    )
  ).slice(0, 20);

  const { data: bookmark, error: insertError } = await supabase
    .from("bookmarks")
    .insert({
      id: bookmarkId,
      user_id: auth.user.id,
      workspace_id: workspaceId,
      url: safeTargetUrl.url,
      title,
      tags,
      note,
      palette: designData.palette,
      fonts: designData.fonts,
      screenshot_url: isImageCapture ? safeTargetUrl.url : null,
      screenshot_path: null,
      screenshot_refreshed_at: isImageCapture ? new Date().toISOString() : null,
      long_screenshot_url: null,
      long_screenshot_path: null,
      long_screenshot_refreshed_at: null,
      summary: type === "selection" ? truncate(payload.text?.trim() ?? "", 1000) : "",
      metadata_refreshed_at: null,
      processing_status:
        isImageCapture || payload.hasExtensionScreenshot ? "ready" : "queued",
      processing_error: null,
      enrichment_started_at: null,
      enrichment_finished_at: null,
    })
    .select()
    .single();

  if (insertError) {
    return extensionCors(
      NextResponse.json({ error: insertError.message }, { status: 500 }),
      origin
    );
  }

  if (!isImageCapture) {
    const job = await enqueueBookmarkProcessingJob({
      supabase,
      bookmarkId,
      userId: auth.user.id,
      workspaceId,
      url: safeTargetUrl.url,
    });

    if (!job.success) {
      await supabase.from("bookmarks").delete().eq("id", bookmarkId).eq("user_id", auth.user.id);
      return extensionCors(
        NextResponse.json({ error: job.error }, { status: 500 }),
        origin
      );
    }

    await triggerProcessorBestEffort();
  }

  return extensionCors(
    NextResponse.json({
      success: true,
      message:
        type === "image"
          ? "Image saved to Nyabag"
          : type === "selection"
            ? "Selection saved to Nyabag"
            : type === "visible_screenshot" || type === "full_page_screenshot"
              ? "Screenshot saved to Nyabag"
              : "Saved to Nyabag",
      bookmark,
    }),
    origin
  );
}

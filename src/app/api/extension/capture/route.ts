import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminServiceClient } from "@/lib/admin/service";
import { authenticateExtensionUser } from "@/lib/extension/auth";
import { validatePublicHttpUrl } from "@/lib/security/url-safety";
import { checkRateLimit, userLimitKey } from "@/lib/rate-limit";
import { getDesignData, getDomain } from "@/lib/data";
import { triggerBookmarkProcessor } from "@/lib/bookmarks/trigger-processor";
import { extensionCors, handleExtensionPreflight } from "@/lib/extension/cors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: NextRequest) {
  return handleExtensionPreflight(request);
}

type ExtensionCaptureType =
  | "page"
  | "image"
  | "link"
  | "selection"
  | "visible_screenshot"
  | "full_page_screenshot";

type ExtensionCapturePayload = {
  type?: ExtensionCaptureType;
  url?: string;
  pageUrl?: string;
  pageTitle?: string;
  text?: string;
  imageBase64?: string;
  collectionId?: string | null;
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

function getTitleForCapture(payload: ExtensionCapturePayload, safeTargetUrl: string) {
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

function getNoteForCapture(payload: ExtensionCapturePayload, safePageUrl?: string) {
  const source = payload.source || "chrome-extension";

  if (payload.type === "selection") {
    const text = truncate(payload.text?.trim() ?? "", 1800);
    return [text, "", safePageUrl ? `Source: ${safePageUrl}` : "", `Captured via ${source}`]
      .filter(Boolean)
      .join("\n");
  }

  if (payload.type === "image") {
    return [safePageUrl ? `Source page: ${safePageUrl}` : "", `Captured via ${source}`]
      .filter(Boolean)
      .join("\n");
  }

  if (payload.type === "visible_screenshot") {
    return [
      "Visible tab screenshot capture requested from Chrome extension.",
      "MVP note: the source page is saved and normal preview processing is queued.",
      safePageUrl ? `Source page: ${safePageUrl}` : "",
      `Captured via ${source}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return `Captured via ${source}`;
}

async function enqueueBookmarkProcessingJob({
  supabase,
  bookmarkId,
  userId,
  url,
}: {
  supabase: ReturnType<typeof createAdminServiceClient>;
  bookmarkId: string;
  userId: string;
  url: string;
}) {
  const { error } = await supabase.rpc("enqueue_bookmark_processing_job", {
    p_bookmark_id: bookmarkId,
    p_user_id: userId,
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

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const auth = await authenticateExtensionUser(request);

  if (!auth.success) {
    return extensionCors(
      NextResponse.json({ error: auth.error }, { status: auth.status }),
      origin
    );
  }

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

  let payload: ExtensionCapturePayload;

  try {
    payload = (await request.json()) as ExtensionCapturePayload;
  } catch {
    return extensionCors(
      NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 }),
      origin
    );
  }

  const type = payload.type;

  if (!type) {
    return extensionCors(
      NextResponse.json({ error: "Capture type is required" }, { status: 400 }),
      origin
    );
  }

  const targetUrl =
    type === "selection" || type === "visible_screenshot" || type === "full_page_screenshot"
      ? payload.pageUrl
      : payload.url;

  if (!targetUrl) {
    return NextResponse.json({ error: "A valid URL is required" }, { status: 400 });
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
      semantic_status: "pending",
      semantic_error: null,
      semantic_processed_at: null,
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

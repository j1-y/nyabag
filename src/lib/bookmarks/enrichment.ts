import "server-only";

import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { getDesignData } from "@/lib/data";
import { mergeTags, scrapeBookmarkMetadata } from "@/lib/metadata";
import { createClient } from "@/lib/supabase/server";
import { timeAsync } from "@/lib/perf";
import type { Bookmark } from "@/lib/types";

const BOOKMARK_SCREENSHOT_BUCKET = "bookmark-screenshots";

const SCREENSHOT_RETRY_DELAYS_MS = [700, 1500, 2500];

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type CachedScreenshot = {
  palette: string[] | null;
  screenshotUrl: string;
  screenshotPath: string;
  refreshedAt: string;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function optimizeBookmarkScreenshot(bytes: ArrayBuffer) {
  const inputBuffer = Buffer.from(bytes);

  return sharp(inputBuffer, {
    animated: false,
    limitInputPixels: 120_000_000,
  })
    .rotate()
    .resize({
      width: 1600,
      withoutEnlargement: true,
    })
    .webp({
      quality: 82,
      effort: 5,
      smartSubsample: true,
      nearLossless: false,
    })
    .toBuffer();
}

export async function fetchScreenshotWithRetry(screenshotUrl: string) {
  for (let attempt = 0; attempt <= SCREENSHOT_RETRY_DELAYS_MS.length; attempt += 1) {
    const response = await fetch(screenshotUrl, { cache: "no-store" });
    const contentType = response.headers.get("content-type") || "";

    if (response.ok && contentType.toLowerCase().startsWith("image/")) {
      return response;
    }

    const delay = SCREENSHOT_RETRY_DELAYS_MS[attempt];
    if (delay) await wait(delay);
  }

  return null;
}

export async function cacheBookmarkScreenshot(
  supabase: Supabase,
  userId: string,
  bookmarkId: string,
  url: string
): Promise<CachedScreenshot | null> {
  return timeAsync("cacheBookmarkScreenshot", async () => {
    void supabase;
    void userId;
    void bookmarkId;
    void url;
    return null;
  });
}

export async function removeBookmarkScreenshot(supabase: Supabase, path: string | null | undefined) {
  if (path) await supabase.storage.from(BOOKMARK_SCREENSHOT_BUCKET).remove([path]);
}

export async function enrichBookmark(
  bookmarkId: string,
  userId: string,
  url: string,
  inputTitle?: string,
  inputTags: string[] = []
): Promise<void> {
  await timeAsync("enrichBookmark", async () => {
    const supabase = await createClient();

    try {
      const [metadata, previewData] = await Promise.all([
        timeAsync("scrapeBookmarkMetadata", () => scrapeBookmarkMetadata(url)),
        cacheBookmarkScreenshot(supabase, userId, bookmarkId, url),
      ]);

      const designData = getDesignData(url);
      const finalTitle = inputTitle?.trim() || metadata.title || undefined;
      const updates: Partial<Bookmark> = {
        tags: mergeTags(inputTags, metadata.tags),
        palette: previewData?.palette ?? designData.palette,
        fonts: designData.fonts,
        screenshot_url: previewData?.screenshotUrl ?? null,
        screenshot_path: previewData?.screenshotPath ?? null,
        screenshot_refreshed_at: previewData?.refreshedAt ?? null,
        summary: metadata.summary,
        metadata_refreshed_at: metadata.refreshedAt,
        processing_status: "ready",
        processing_error: null,
        enrichment_finished_at: new Date().toISOString(),
        semantic_status: "pending",
        semantic_error: null,
        semantic_processed_at: null,
      };

      if (finalTitle) updates.title = finalTitle;

      const { error } = await supabase
        .from("bookmarks")
        .update(updates)
        .eq("id", bookmarkId)
        .eq("user_id", userId);

      if (error) {
        await removeBookmarkScreenshot(supabase, previewData?.screenshotPath);
        throw error;
      }

      revalidatePath("/");
      revalidatePath(`/bookmarks/${bookmarkId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bookmark enrichment failed";
      await supabase
        .from("bookmarks")
        .update({
          processing_status: "failed",
          processing_error: message.slice(0, 500),
          enrichment_finished_at: new Date().toISOString(),
        })
        .eq("id", bookmarkId)
        .eq("user_id", userId);
      revalidatePath("/");
    }
  });
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getDesignData, getDomain } from "@/lib/data";
import { triggerBookmarkProcessor } from "@/lib/bookmarks/trigger-processor";
import type { Bookmark } from "@/lib/types";

export type QueuedBookmarkSource = "telegram";

type CreateQueuedBookmarkInput = {
  supabase: SupabaseClient;
  userId: string;
  url: string;
  source: QueuedBookmarkSource;
};

function getFallbackTitle(url: string) {
  const domain = getDomain(url);
  return domain ? domain.charAt(0).toUpperCase() + domain.slice(1) : url;
}

async function triggerProcessorBestEffort() {
  const result = await triggerBookmarkProcessor();
  if (!result.success) {
    console.error("[createQueuedBookmarkForUser] Bookmark processor trigger failed:", result.error);
  }
}

export async function createQueuedBookmarkForUser({
  supabase,
  userId,
  url,
  source,
}: CreateQueuedBookmarkInput): Promise<{ success: true; bookmark: Bookmark } | { success: false; error: string }> {
  const id = crypto.randomUUID();
  const designData = getDesignData(url);

  const { data, error } = await supabase
    .from("bookmarks")
    .insert({
      id,
      user_id: userId,
      url,
      title: getFallbackTitle(url),
      tags: [],
      note: source === "telegram" ? "Saved from Telegram" : "",
      palette: designData.palette,
      fonts: designData.fonts,
      screenshot_url: null,
      screenshot_path: null,
      screenshot_refreshed_at: null,
      long_screenshot_url: null,
      long_screenshot_path: null,
      long_screenshot_refreshed_at: null,
      summary: "",
      metadata_refreshed_at: null,
      processing_status: "queued",
      processing_error: null,
      enrichment_started_at: null,
      enrichment_finished_at: null,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  const { error: jobError } = await supabase
    .from("bookmark_processing_jobs")
    .insert({
      bookmark_id: id,
      user_id: userId,
      url,
      status: "queued",
      error_message: null,
      locked_at: null,
      locked_by: null,
      run_after: new Date().toISOString(),
    });

  if (jobError) {
    await supabase.from("bookmarks").delete().eq("id", id).eq("user_id", userId);
    return { success: false, error: jobError.message };
  }

  await triggerProcessorBestEffort();

  return { success: true, bookmark: data as Bookmark };
}

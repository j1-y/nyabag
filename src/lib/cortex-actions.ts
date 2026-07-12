"use server";

import { revalidatePath } from "next/cache";
import { ingestBookmarkToCortex, isCortexConfigured } from "@/lib/cortex";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspaces";
import type { ActionResult, CortexStatus } from "@/lib/types";

export type CortexReadyIngestResult = {
  attempted: number;
  ingested: number;
  failed: number;
  skipped: number;
};

type ReadyBookmarkForCortex = {
  id: string;
  user_id: string;
  workspace_id: string;
  url: string;
  title: string;
  summary: string | null;
  screenshot_url: string | null;
  long_screenshot_url: string | null;
  cortex_status: CortexStatus;
};

const INGESTIBLE_CORTEX_STATUSES: CortexStatus[] = ["pending", "failed", "skipped"];

function clampLimit(limit: number) {
  if (!Number.isFinite(limit)) return 5;
  return Math.max(1, Math.min(10, Math.floor(limit)));
}

function shortError(value: string) {
  return value.slice(0, 500);
}

async function markCortexStatus({
  supabase,
  bookmarkId,
  userId,
  workspaceId,
  status,
  error,
  memoryId,
  ingestedAt,
  tags,
  palette,
  fonts,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  bookmarkId: string;
  userId: string;
  workspaceId: string;
  status: CortexStatus;
  error?: string | null;
  memoryId?: string | null;
  ingestedAt?: string | null;
  tags?: string[];
  palette?: string[];
  fonts?: string[];
  summary?: string;
}) {
  const updateData: any = {
    cortex_status: status,
    cortex_error: error ?? null,
    cortex_memory_id: memoryId ?? null,
    cortex_ingested_at: ingestedAt ?? null,
  };

  if (tags && tags.length > 0) updateData.tags = tags;
  if (palette && palette.length > 0) updateData.palette = palette;
  if (fonts && fonts.length > 0) updateData.fonts = fonts;
  if (summary) updateData.summary = summary;

  await supabase
    .from("bookmarks")
    .update(updateData)
    .eq("id", bookmarkId)
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId);
}

export async function ingestReadyBookmarksToCortex(
  limit = 5
): Promise<ActionResult<CortexReadyIngestResult>> {
  const counts: CortexReadyIngestResult = {
    attempted: 0,
    ingested: 0,
    failed: 0,
    skipped: 0,
  };

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Not authenticated" };
    const workspaceContext = await getWorkspaceContext(supabase, user);
    const activeWorkspaceId = workspaceContext.activeWorkspace.id;

    const safeLimit = clampLimit(limit);
    const { data, error } = await supabase
      .from("bookmarks")
      .select("id,user_id,workspace_id,url,title,summary,screenshot_url,long_screenshot_url,cortex_status")
      .eq("user_id", user.id)
      .eq("workspace_id", activeWorkspaceId)
      .eq("processing_status", "ready")
      .in("cortex_status", INGESTIBLE_CORTEX_STATUSES)
      .or("long_screenshot_url.not.is.null,screenshot_url.not.is.null")
      .order("updated_at", { ascending: false })
      .limit(safeLimit);

    if (error) {
      console.warn("[cortex] Could not read ready bookmarks for ingest:", error.message);
      return { success: true, data: counts };
    }

    const bookmarks = (data ?? []) as ReadyBookmarkForCortex[];
    if (bookmarks.length === 0) return { success: true, data: counts };

    for (const bookmark of bookmarks) {
      const screenshotUrl = bookmark.long_screenshot_url ?? bookmark.screenshot_url;

      if (!screenshotUrl) {
        console.warn("[cortex] Skipping ready bookmark ingest because screenshot URL is missing.", {
          bookmarkId: bookmark.id,
        });
        counts.skipped += 1;
        await markCortexStatus({
          supabase,
          bookmarkId: bookmark.id,
          userId: user.id,
          workspaceId: activeWorkspaceId,
          status: "skipped",
          error: "Missing screenshot URL",
        });
        continue;
      }

      const { data: claimed, error: claimError } = await supabase
        .from("bookmarks")
        .update({
          cortex_status: "processing",
          cortex_error: null,
        })
        .eq("id", bookmark.id)
        .eq("user_id", user.id)
        .eq("workspace_id", activeWorkspaceId)
        .eq("processing_status", "ready")
        .in("cortex_status", INGESTIBLE_CORTEX_STATUSES)
        .select("id")
        .maybeSingle();

      if (claimError || !claimed) {
        counts.skipped += 1;
        continue;
      }

      counts.attempted += 1;

      if (!isCortexConfigured()) {
        const errorMessage = "Cortex API URL is not configured";
        await ingestBookmarkToCortex({
          nyabagBookmarkId: bookmark.id,
          userId: user.id,
          workspaceId: activeWorkspaceId,
          url: bookmark.url,
          title: bookmark.title,
          summary: bookmark.summary,
          screenshotUrl,
        });
        await markCortexStatus({
          supabase,
          bookmarkId: bookmark.id,
          userId: user.id,
          workspaceId: activeWorkspaceId,
          status: "skipped",
          error: errorMessage,
        });
        counts.skipped += 1;
        continue;
      }

      const response = await ingestBookmarkToCortex({
        nyabagBookmarkId: bookmark.id,
        userId: user.id,
        workspaceId: activeWorkspaceId,
        url: bookmark.url,
        title: bookmark.title,
        summary: bookmark.summary,
        screenshotUrl,
      });

      if (!response) {
        counts.failed += 1;
        await markCortexStatus({
          supabase,
          bookmarkId: bookmark.id,
          userId: user.id,
          workspaceId: activeWorkspaceId,
          status: "failed",
          error: shortError("Cortex ingest failed"),
        });
        continue;
      }

      await markCortexStatus({
        supabase,
        bookmarkId: bookmark.id,
        userId: user.id,
        workspaceId: activeWorkspaceId,
        status: "ready",
        error: null,
        memoryId: response.memoryId ?? null,
        ingestedAt: new Date().toISOString(),
        tags: response.autoTags,
        palette: response.palette,
        fonts: response.fonts,
        summary: response.summary,
      });
      counts.ingested += 1;
    }

    if (counts.attempted > 0 || counts.skipped > 0) {
      revalidatePath("/");
    }

    return { success: true, data: counts };
  } catch (error) {
    console.warn("[cortex] Ready bookmark ingest action failed:", shortError(error instanceof Error ? error.message : String(error)));
    return { success: true, data: counts };
  }
}

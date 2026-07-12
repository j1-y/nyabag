"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getDesignData } from "@/lib/data";
import { validatePublicHttpUrl } from "@/lib/security/url-safety";
import { checkRateLimit, userLimitKey } from "@/lib/rate-limit";
import { getDomain } from "@/lib/data";
import { removeBookmarkScreenshot } from "@/lib/bookmarks/storage";
import { triggerBookmarkProcessor } from "@/lib/bookmarks/trigger-processor";
import { deleteBookmarkFromCortex, isCortexConfigured, searchCortex, type CortexSearchResult } from "@/lib/cortex";
import { getWorkspaceContext } from "@/lib/workspaces";
import { timeAsync } from "@/lib/perf";
import { PROFILE_AVATAR_BUCKET } from "@/lib/profile";
import { getTelegramBotUrl, isTelegramConfigured } from "@/lib/telegram/config";
import { generateVerificationCode, hashVerificationCode } from "@/lib/telegram/verify";
import { bookmarkCreateSchema, bookmarkUpdateSchema, profileUpdateSchema } from "@/lib/validations";
import { extractUrlsFromText } from "@/lib/url-extraction";
import type {
  ActionResult,
  Bookmark,
  CortexBookmarkSearchPayload,
  ImportBookmarksResult,
  TelegramConnection,
  UserProfile,
} from "@/lib/types";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

type Supabase = Awaited<ReturnType<typeof createClient>>;

type CreateBookmarkForUserInput = {
  supabase: Supabase;
  userId: string;
  workspaceId: string;
  url: string;
  title?: string;
  tags?: string[];
  note?: string;
  folder_id?: string | null;
};

function avatarExtension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  return file.type.split("/")[1] || "png";
}

async function enqueueBookmarkProcessingJob(
  supabase: Supabase,
  bookmarkId: string,
  userId: string,
  workspaceId: string,
  url: string
): Promise<ActionResult<string>> {
  const { data, error } = await supabase.rpc("enqueue_bookmark_processing_job", {
    p_bookmark_id: bookmarkId,
    p_user_id: userId,
    p_workspace_id: workspaceId,
    p_url: url,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data: String(data) };
}

async function triggerProcessorBestEffort(context: string) {
  const triggerResult = await triggerBookmarkProcessor();
  if (!triggerResult.success) {
    console.error(`[${context}] Bookmark processor trigger failed:`, triggerResult.error);
  }
}

function getCortexBookmarkId(result: CortexSearchResult) {
  const id = result.nyabagBookmarkId?.trim();
  return id || null;
}

function uniqueCortexBookmarkIds(results: CortexSearchResult[]) {
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const result of results) {
    const id = getCortexBookmarkId(result);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  return ids;
}

function filterCortexRowsForUser(results: CortexSearchResult[], userId: string) {
  let dropped = 0;
  const rows = results.filter((result) => {
    const resultUserId = result.userId?.trim();
    if (!resultUserId || resultUserId === userId) return true;
    dropped += 1;
    return false;
  });

  if (dropped > 0) {
    console.warn("[cortex] Dropped cross-user search results before Supabase owner filtering.", { dropped });
  }

  return rows;
}

function getCortexSearchReasons(result: CortexSearchResult) {
  const reasons = [
    result.contentPreview?.trim(),
    result.visualPreview?.trim(),
    ...(result.autoTags ?? []).slice(0, 2).map((tag) => `Tag: ${tag}`),
  ].filter((reason): reason is string => Boolean(reason));

  return reasons.slice(0, 3);
}

async function createBookmarkForUser({
  supabase,
  userId,
  workspaceId,
  url,
  title,
  tags = [],
  note,
  folder_id,
}: CreateBookmarkForUserInput): Promise<ActionResult<Bookmark>> {
  const domain = getDomain(url);
  const id = crypto.randomUUID();
  const designData = getDesignData(url);

  const fallbackTitle =
    title?.trim() ||
    domain.charAt(0).toUpperCase() + domain.slice(1) ||
    url;

  const { data, error } = await supabase
    .from("bookmarks")
    .insert({
      id,
      user_id: userId,
      workspace_id: workspaceId,
      url,
      title: fallbackTitle,
      tags,
      note: note ?? "",
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
      folder_id: folder_id ?? null,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  const job = await enqueueBookmarkProcessingJob(supabase, id, userId, workspaceId, url);
  if (!job.success) return { success: false, error: job.error };

  await triggerProcessorBestEffort("createBookmarkForUser");

  return { success: true, data };
}

// ── Create ────────────────────────────────────────────────────
export async function createBookmark(
  formData: FormData
): Promise<ActionResult<Bookmark>> {
  return timeAsync("createBookmark", async () => {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        success: false,
        error: "Not authenticated",
      };
    }

    const rate = await checkRateLimit({
      scope: "bookmark-create",
      identifier: userLimitKey(user.id),
      limit: 30,
      windowSeconds: 60 * 60,
    });

    if (!rate.allowed) {
      return {
        success: false,
        error: "You have saved too many bookmarks recently. Please try again later.",
      };
    }

    const workspaceContext = await getWorkspaceContext(supabase, user);
    const activeWorkspaceId = workspaceContext.activeWorkspace.id;

    const rawFolderId = formData.get("folder_id");
    const parsed = bookmarkCreateSchema.safeParse({
      url: formData.get("url"),
      title: formData.get("title") ?? undefined,
      tags: formData.get("tags") ?? "",
      note: formData.get("note") ?? undefined,
      folder_id: rawFolderId ? String(rawFolderId) : null,
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid bookmark details",
      };
    }

    const safeUrl = await validatePublicHttpUrl(parsed.data.url);

    if (!safeUrl.safe) {
      return {
        success: false,
        error: safeUrl.error,
      };
    }

    // Verify folder ownership if provided
    let validFolderId: string | null = null;
    if (parsed.data.folder_id) {
      const { data: folder } = await supabase
        .from("bookmark_folders")
        .select("id")
        .eq("id", parsed.data.folder_id)
        .eq("user_id", user.id)
        .eq("workspace_id", activeWorkspaceId)
        .maybeSingle();
      if (!folder) {
        return { success: false, error: "Folder not found or not owned by you" };
      }
      validFolderId = folder.id;
    }

    const result = await createBookmarkForUser({
      supabase,
      userId: user.id,
      workspaceId: activeWorkspaceId,
      url: safeUrl.url,
      title: parsed.data.title,
      tags: parsed.data.tags,
      note: parsed.data.note,
      folder_id: validFolderId,
    });

    if (!result.success) return result;

    revalidatePath("/");
    if (validFolderId) revalidatePath(`/folders/${validFolderId}`);

    return result;
  });
}

export async function searchCortexBookmarks(
  query: string,
  limit = 20
): Promise<ActionResult<CortexBookmarkSearchPayload>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const workspaceContext = await getWorkspaceContext(supabase, user);
  const activeWorkspaceId = workspaceContext.activeWorkspace.id;

  const trimmed = query.replace(/\s+/g, " ").trim().slice(0, 500);
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));

  if (!trimmed) {
    return {
      success: true,
      data: {
        bookmarks: [],
        query: "",
        result_count: 0,
        configured: isCortexConfigured(),
        workspace_id: activeWorkspaceId,
      },
    };
  }

  if (!isCortexConfigured()) {
    return { success: false, error: "Cortex search unavailable" };
  }

  const cortexResults = await searchCortex({
    query: trimmed,
    userId: user.id,
    workspaceId: activeWorkspaceId,
    limit: safeLimit,
  });
  if (!cortexResults) {
    return { success: false, error: "Cortex search unavailable" };
  }

  const cortexRows = filterCortexRowsForUser(cortexResults.results ?? [], user.id);
  const orderedIds = uniqueCortexBookmarkIds(cortexRows);

  if (orderedIds.length === 0) {
    return {
      success: true,
      data: {
        bookmarks: [],
        query: cortexResults.query ?? trimmed,
        result_count: 0,
        configured: true,
        workspace_id: activeWorkspaceId,
        message: "No Cortex matches found.",
      },
    };
  }

  const { data, error } = await supabase
    .from("bookmarks")
    .select("*")
    .eq("user_id", user.id)
    .eq("workspace_id", activeWorkspaceId)
    .in("id", orderedIds);

  if (error) {
    return { success: false, error: error.message };
  }

  const bookmarks = (data ?? []) as Bookmark[];
  const bookmarkById = new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]));
  const resultById = new Map<string, CortexSearchResult>();

  cortexRows.forEach((result) => {
    const id = getCortexBookmarkId(result);
    if (id && !resultById.has(id)) resultById.set(id, result);
  });

  const orderedBookmarks = orderedIds
    .map((id, index) => {
      const bookmark = bookmarkById.get(id);
      const result = resultById.get(id);
      if (!bookmark || !result) return null;

      const similarity = typeof result.similarity === "number" ? result.similarity : undefined;
      const fallbackScore = 1 - index / Math.max(orderedIds.length, 1);

      const enrichedBookmark: Bookmark = {
        ...bookmark,
        search_score: similarity ?? fallbackScore,
        search_mode: "cortex" as const,
        search_match_reasons: getCortexSearchReasons(result),
        semantic_similarity: similarity,
        match_label: "Cortex match",
        match_strength: similarity !== undefined && similarity >= 0.75 ? "strong" : "related",
      };

      return enrichedBookmark;
    })
    .filter((bookmark): bookmark is Bookmark => Boolean(bookmark));

  return {
    success: true,
    data: {
      bookmarks: orderedBookmarks,
      query: cortexResults.query ?? trimmed,
      result_count: orderedBookmarks.length,
      configured: true,
      workspace_id: activeWorkspaceId,
    },
  };
}

export async function importBookmarks(
  formData: FormData
): Promise<ActionResult<ImportBookmarksResult>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "Not authenticated",
    };
  }

  const rate = await checkRateLimit({
    scope: "bookmark-import",
    identifier: userLimitKey(user.id),
    limit: 3,
    windowSeconds: 60 * 60,
  });

  if (!rate.allowed) {
    return {
      success: false,
      error: "Import limit reached. Please try again later.",
    };
  }

  const workspaceContext = await getWorkspaceContext(supabase, user);
  const activeWorkspaceId = workspaceContext.activeWorkspace.id;

  const rawUrls = formData.get("urls");
  const rawText = String(formData.get("text") ?? "");

  let sourceText = rawText;

  if (typeof rawUrls === "string" && rawUrls.trim()) {
    try {
      const parsedUrls = JSON.parse(rawUrls);

      if (Array.isArray(parsedUrls)) {
        sourceText = parsedUrls
          .filter((value) => typeof value === "string")
          .join("\n");
      }
    } catch {
      return {
        success: false,
        error: "Could not read imported URLs",
      };
    }
  }

  const urls = extractUrlsFromText(sourceText);

  if (urls.length === 0) {
    return {
      success: false,
      error: "Paste or drop text containing URLs to begin.",
    };
  }

  if (urls.length > 50) {
    return {
      success: false,
      error: "You can import up to 50 URLs at a time.",
    };
  }

  const result: ImportBookmarksResult = {
    created: [],
    failed: [],
    skipped: [],
    total: urls.length,
  };

  for (const rawUrl of urls) {
    const parsed = bookmarkCreateSchema.safeParse({
      url: rawUrl,
      title: undefined,
      tags: "",
      note: undefined,
    });

    if (!parsed.success) {
      result.failed.push({
        url: rawUrl,
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid URL",
      });
      continue;
    }

    const normalizedUrl = parsed.data.url;

    const safeUrl = await validatePublicHttpUrl(normalizedUrl);

    if (!safeUrl.safe) {
      result.failed.push({
        url: normalizedUrl,
        success: false,
        error: safeUrl.error,
      });
      continue;
    }

    const finalUrl = safeUrl.url;

    const { data: duplicate, error: duplicateError } = await supabase
      .from("bookmarks")
      .select("id")
      .eq("user_id", user.id)
      .eq("workspace_id", activeWorkspaceId)
      .eq("url", finalUrl)
      .maybeSingle();

    if (duplicateError) {
      result.failed.push({
        url: finalUrl,
        success: false,
        error: duplicateError.message,
      });
      continue;
    }

    if (duplicate) {
      result.skipped.push({
        url: normalizedUrl,
        success: false,
        error: "Already saved",
      });
      continue;
    }

    const created = await createBookmarkForUser({
      supabase,
      userId: user.id,
      workspaceId: activeWorkspaceId,
      url: normalizedUrl,
      tags: [],
    });

    if (created.success) {
      result.created.push(created.data);
    } else {
      result.failed.push({
        url: normalizedUrl,
        success: false,
        error: created.error,
      });
    }
  }

  if (result.created.length > 0) {
    revalidatePath("/");
  }

  return {
    success: true,
    data: result,
  };
}

// ── Update ────────────────────────────────────────────────────
export async function updateBookmark(
  formData: FormData
): Promise<ActionResult<Bookmark>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };
  const workspaceContext = await getWorkspaceContext(supabase, user);
  const activeWorkspaceId = workspaceContext.activeWorkspace.id;

  const rawFolderId = formData.get("folder_id");
  const parsed = bookmarkUpdateSchema.safeParse({
    id: formData.get("id"),
    url: formData.get("url"),
    title: formData.get("title"),
    tags: formData.get("tags") ?? "",
    note: formData.get("note"),
    folder_id: rawFolderId !== null ? (rawFolderId === "" ? null : String(rawFolderId)) : undefined,
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { id, url, tags, note, folder_id: parsedFolderId } = parsed.data;

  const { data: existing } = await supabase
    .from("bookmarks")
    .select("url, palette, fonts, screenshot_url, screenshot_path, screenshot_refreshed_at, long_screenshot_url, long_screenshot_path, long_screenshot_refreshed_at, summary, metadata_refreshed_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("workspace_id", activeWorkspaceId)
    .single();

  const domain = getDomain(url);
  const urlChanged = !existing || existing.url !== url;

  const title =
    parsed.data.title?.trim() ||
    domain.charAt(0).toUpperCase() + domain.slice(1) ||
    url;

  const designData = getDesignData(url);

  const { palette, fonts } =
    existing && !urlChanged
      ? {
          palette: existing.palette ?? designData.palette,
          fonts: existing.fonts ?? designData.fonts,
        }
      : {
          palette: designData.palette,
          fonts: designData.fonts,
        };

  // Validate folder ownership if folder_id is being updated
  let resolvedFolderId: string | null | undefined = undefined; // undefined = don't touch folder
  if (parsedFolderId !== undefined) {
    if (parsedFolderId === null || parsedFolderId === "") {
      resolvedFolderId = null; // Remove from folder
    } else {
      const { data: folder } = await supabase
        .from("bookmark_folders")
        .select("id")
        .eq("id", parsedFolderId)
        .eq("user_id", user.id)
        .eq("workspace_id", activeWorkspaceId)
        .maybeSingle();
      if (!folder) {
        return { success: false, error: "Folder not found or not owned by you" };
      }
      resolvedFolderId = folder.id;
    }
  }

  const updatePayload: Record<string, unknown> = {
    url,
    title,
    tags,
    note: note ?? "",
    palette,
    fonts,
    screenshot_url: urlChanged ? null : existing?.screenshot_url ?? null,
    screenshot_path: urlChanged ? null : existing?.screenshot_path ?? null,
    screenshot_refreshed_at: urlChanged ? null : existing?.screenshot_refreshed_at ?? null,
    long_screenshot_url: urlChanged ? null : existing?.long_screenshot_url ?? null,
    long_screenshot_path: urlChanged ? null : existing?.long_screenshot_path ?? null,
    long_screenshot_refreshed_at: urlChanged ? null : existing?.long_screenshot_refreshed_at ?? null,
    summary: urlChanged ? "" : existing?.summary ?? "",
    metadata_refreshed_at: urlChanged ? null : existing?.metadata_refreshed_at ?? null,
    processing_status: urlChanged ? "queued" : undefined,
    processing_error: urlChanged ? null : undefined,
    cortex_status: urlChanged ? "pending" : undefined,
    cortex_error: urlChanged ? null : undefined,
    cortex_memory_id: urlChanged ? null : undefined,
    cortex_ingested_at: urlChanged ? null : undefined,
    enrichment_started_at: urlChanged ? null : undefined,
    enrichment_finished_at: urlChanged ? null : undefined,
  };

  // Only include folder_id in update if it was explicitly provided in form
  if (resolvedFolderId !== undefined) {
    updatePayload.folder_id = resolvedFolderId;
  }

  const { data, error } = await supabase
    .from("bookmarks")
    .update(updatePayload)
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("workspace_id", activeWorkspaceId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  if (urlChanged && existing?.screenshot_path) {
    await removeBookmarkScreenshot(supabase, existing.screenshot_path);
  } 
  if (urlChanged && existing?.long_screenshot_path) {
    await removeBookmarkScreenshot(supabase, existing.long_screenshot_path);
  }

  if (urlChanged) {
    const job = await enqueueBookmarkProcessingJob(supabase, id, user.id, activeWorkspaceId, url);
    if (!job.success) return { success: false, error: job.error };
    await triggerProcessorBestEffort("updateBookmark");
  }

  revalidatePath("/");
  if (resolvedFolderId) revalidatePath(`/folders/${resolvedFolderId}`);
  revalidatePath("/folders/inbox");
  return { success: true, data };
}

export async function refreshBookmarkScreenshot(
  id: string
): Promise<ActionResult<Bookmark>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "Not authenticated",
    };
  }

  const workspaceContext = await getWorkspaceContext(supabase, user);
  const activeWorkspaceId = workspaceContext.activeWorkspace.id;

  const rate = await checkRateLimit({
    scope: "bookmark-refresh",
    identifier: userLimitKey(user.id),
    limit: 10,
    windowSeconds: 60 * 60,
  });

  if (!rate.allowed) {
    return {
      success: false,
      error: "Preview refresh limit reached. Please try again later.",
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("bookmarks")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("workspace_id", activeWorkspaceId)
    .single();

  if (existingError || !existing) {
    return {
      success: false,
      error: "Bookmark not found",
    };
  }

  const { data, error } = await supabase
    .from("bookmarks")
    .update({
      processing_status: "queued",
      processing_error: null,
      cortex_status: "pending",
      cortex_error: null,
      cortex_memory_id: null,
      cortex_ingested_at: null,
      enrichment_started_at: null,
      enrichment_finished_at: null,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("workspace_id", activeWorkspaceId)
    .select()
    .single();

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  const job = await enqueueBookmarkProcessingJob(
    supabase,
    id,
    user.id,
    activeWorkspaceId,
    existing.url
  );

  if (!job.success) {
    return {
      success: false,
      error: job.error,
    };
  }

  await triggerProcessorBestEffort("refreshBookmarkScreenshot");

  revalidatePath("/");
  revalidatePath(`/bookmarks/${id}`);

  return {
    success: true,
    data,
  };
}

// ── Delete ────────────────────────────────────────────────────
export async function retryBookmarkProcessing(
  id: string
): Promise<ActionResult<Bookmark>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "Not authenticated",
    };
  }

  const workspaceContext = await getWorkspaceContext(supabase, user);
  const activeWorkspaceId = workspaceContext.activeWorkspace.id;

  const rate = await checkRateLimit({
    scope: "bookmark-retry",
    identifier: userLimitKey(user.id),
    limit: 10,
    windowSeconds: 60 * 60,
  });

  if (!rate.allowed) {
    return {
      success: false,
      error: "Retry limit reached. Please try again later.",
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("bookmarks")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("workspace_id", activeWorkspaceId)
    .single();

  if (existingError || !existing) {
    return {
      success: false,
      error: "Bookmark not found",
    };
  }

  const { data, error } = await supabase
    .from("bookmarks")
    .update({
      processing_status: "queued",
      processing_error: null,
      cortex_status: "pending",
      cortex_error: null,
      cortex_memory_id: null,
      cortex_ingested_at: null,
      enrichment_started_at: null,
      enrichment_finished_at: null,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("workspace_id", activeWorkspaceId)
    .select()
    .single();

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  const job = await enqueueBookmarkProcessingJob(
    supabase,
    id,
    user.id,
    activeWorkspaceId,
    existing.url
  );

  if (!job.success) {
    return {
      success: false,
      error: job.error,
    };
  }

  await triggerProcessorBestEffort("retryBookmarkProcessing");

  revalidatePath("/");
  revalidatePath(`/bookmarks/${id}`);

  return {
    success: true,
    data,
  };
}

export async function getBookmarks(): Promise<ActionResult<Bookmark[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };
  const workspaceContext = await getWorkspaceContext(supabase, user);
  const activeWorkspaceId = workspaceContext.activeWorkspace.id;

  const { data, error } = await supabase
    .from("bookmarks")
    .select("*")
    .eq("user_id", user.id)
    .eq("workspace_id", activeWorkspaceId)
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as Bookmark[] };
}

export async function getProcessingBookmarks(): Promise<ActionResult<Bookmark[]>> {
  return getBookmarks();
}

export async function deleteBookmark(id: string): Promise<ActionResult> {
  console.log(`[deleteBookmark] Triggered for id: ${id}`);

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error("[deleteBookmark] Auth error:", authError);
      return { success: false, error: authError.message };
    }

    if (!user) {
      console.warn("[deleteBookmark] No user found in session");
      return { success: false, error: "Not authenticated" };
    }

    console.log(`[deleteBookmark] Authenticated this user: ${user.email} (${user.id})`);
    const workspaceContext = await getWorkspaceContext(supabase, user);
    const activeWorkspaceId = workspaceContext.activeWorkspace.id;

    const { data: bookmarkForCleanup } = await supabase
      .from("bookmarks")
      .select("screenshot_path, long_screenshot_path, cortex_memory_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("workspace_id", activeWorkspaceId)
      .maybeSingle();

    const { error, count } = await supabase
      .from("bookmarks")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("workspace_id", activeWorkspaceId);

    if (error) {
      console.error("[deleteBookmark] Supabase delete error:", error);
      return { success: false, error: error.message };
    }

    console.log(`[deleteBookmark] Delete completed. Affected rows: ${count}`);

    if (count === 0) {
      const { data: exists } = await supabase
        .from("bookmarks")
        .select("id, user_id, workspace_id")
        .eq("id", id)
        .maybeSingle();

      if (exists) {
        console.warn(`[deleteBookmark] Bookmark ${id} exists but belongs to user ${exists.user_id} instead of ${user.id}`);
        return { success: false, error: "Permission denied: Bookmark belongs to another user" };
      }

      console.warn(`[deleteBookmark] Bookmark ${id} does not exist in the database`);
      return { success: false, error: "Bookmark not found" };
    }

    revalidatePath("/");
    await deleteBookmarkFromCortex({
      nyabagBookmarkId: id,
      userId: user.id,
      workspaceId: activeWorkspaceId,
      memoryId: bookmarkForCleanup?.cortex_memory_id,
    });
    await removeBookmarkScreenshot(supabase, bookmarkForCleanup?.screenshot_path);
    await removeBookmarkScreenshot(supabase, bookmarkForCleanup?.long_screenshot_path);

    return { success: true, data: undefined };
  } catch (err: unknown) {
    console.error("[deleteBookmark] Unexpected exception:", err);
    return { success: false, error: err instanceof Error ? err.message : "Internal server error" };
  }
}

// ── Auth ──────────────────────────────────────────────────────
export async function updateProfile(
  formData: FormData
): Promise<ActionResult<UserProfile>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "Not authenticated",
    };
  }

  const parsed = profileUpdateSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid profile details",
    };
  }

  const { data: existing } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("user_id", user.id)
    .maybeSingle();

  let avatarPath = existing?.avatar_path ?? null;
  const avatar = formData.get("avatar");

  if (avatar instanceof File && avatar.size > 0) {
    const rate = await checkRateLimit({
      scope: "profile-avatar-upload",
      identifier: userLimitKey(user.id),
      limit: 10,
      windowSeconds: 24 * 60 * 60,
    });

    if (!rate.allowed) {
      return {
        success: false,
        error: "Profile picture update limit reached for today.",
      };
    }

    if (!AVATAR_TYPES.has(avatar.type)) {
      return {
        success: false,
        error: "Profile picture must be a JPG, PNG, WEBP, or GIF",
      };
    }

    if (avatar.size > MAX_AVATAR_BYTES) {
      return {
        success: false,
        error: "Profile picture must be 5MB or smaller",
      };
    }

    const nextPath = `${user.id}/avatar-${Date.now()}.${avatarExtension(
      avatar
    )}`;

    const { error: uploadError } = await supabase.storage
      .from(PROFILE_AVATAR_BUCKET)
      .upload(nextPath, avatar, {
        cacheControl: "3600",
        contentType: avatar.type,
        upsert: true,
      });

    if (uploadError) {
      return {
        success: false,
        error: uploadError.message,
      };
    }

    if (avatarPath) {
      await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([avatarPath]);
    }

    avatarPath = nextPath;
  }

  const { data, error } = await supabase
    .from("profiles")
    .upsert({
      user_id: user.id,
      name: parsed.data.name ?? "",
      email: parsed.data.email || user.email || "",
      phone: parsed.data.phone ?? "",
      avatar_path: avatarPath,
    })
    .select()
    .single();

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  const avatarUrl = avatarPath
    ? supabase.storage.from(PROFILE_AVATAR_BUCKET).getPublicUrl(avatarPath).data
        .publicUrl
    : null;

  revalidatePath("/profile");
  revalidatePath("/");
  revalidatePath("/canvas");

  return {
    success: true,
    data: {
      ...(data as UserProfile),
      avatar_url: avatarUrl,
    },
  };
}

const TELEGRAM_CONNECTION_SELECT =
  "id,user_id,telegram_user_id,telegram_chat_id,telegram_username,first_name,last_name,status,verification_code_expires_at,connected_at,disconnected_at,created_at,updated_at";

export async function getTelegramConnection(): Promise<
  ActionResult<{ configured: boolean; connection: TelegramConnection | null; botUrl?: string }>
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("telegram_connections")
    .select(TELEGRAM_CONNECTION_SELECT)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    data: {
      configured: isTelegramConfigured(),
      connection: data ? (data as TelegramConnection) : null,
      botUrl: getTelegramBotUrl(),
    },
  };
}

export async function createTelegramConnectionCode(): Promise<
  ActionResult<{ code: string; expiresAt: string; botUrl?: string }>
> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "Not authenticated",
    };
  }

  if (!isTelegramConfigured()) {
    return {
      success: false,
      error: "Telegram integration is not configured",
    };
  }

  const rate = await checkRateLimit({
    scope: "telegram-connection-code",
    identifier: userLimitKey(user.id),
    limit: 5,
    windowSeconds: 60 * 60,
  });

  if (!rate.allowed) {
    return {
      success: false,
      error: "You have generated too many Telegram codes. Please try again later.",
    };
  }

  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from("telegram_connections")
    .upsert(
      {
        user_id: user.id,
        status: "pending",
        verification_code_hash: hashVerificationCode(code),
        verification_code_expires_at: expiresAt,
        telegram_user_id: null,
        telegram_chat_id: null,
        telegram_username: null,
        first_name: null,
        last_name: null,
        connected_at: null,
        disconnected_at: null,
      },
      {
        onConflict: "user_id",
      }
    );

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  revalidatePath("/profile");

  return {
    success: true,
    data: {
      code,
      expiresAt,
      botUrl: getTelegramBotUrl(),
    },
  };
}

export async function disconnectTelegram(): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("telegram_connections")
    .update({
      status: "disabled",
      verification_code_hash: null,
      verification_code_expires_at: null,
      disconnected_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/profile");
  return { success: true, data: undefined };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/");
}

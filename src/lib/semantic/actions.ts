"use server";

import { revalidatePath } from "next/cache";
import { BOOKMARK_SEARCH_CONFIG, isBookmarkSearchDebugEnabled } from "@/lib/bookmark-search/config";
import {
  filterStrongSearchResults,
  fuseSearchCandidates,
  type FusedSearchCandidate,
  type SearchCandidateInput,
} from "@/lib/bookmark-search/fusion";
import { parseBookmarkSearchQuery, type TemporalFilter } from "@/lib/bookmark-search/temporal-query";
import type { BookmarkSearchPayload, BookmarkSearchRequest, BookmarkSearchResult } from "@/lib/bookmark-search/types";
import { attachAiMetadataToBookmarks, getBookmarkAiMetadata } from "@/lib/bookmarks/ai-metadata";
import {
  createBookmarkDocumentEmbedding,
  createBookmarkQueryEmbedding,
  EMBEDDING_MODEL,
  toPgVectorLiteral,
} from "@/lib/semantic/embeddings";
import {
  BOOKMARK_RETRIEVAL_SCHEMA_VERSION,
  buildBookmarkMemoryText,
  getBookmarkMemoryContentHash,
} from "@/lib/semantic/memory-text";
import { createClient } from "@/lib/supabase/server";
import { buildMemoryChunks, getMemoryChunkContentHash } from "@/lib/visual-memory/chunks";
import { searchBookmarksHybridVisual } from "@/lib/visual-memory/hybrid-search";
import type { ActionResult, Bookmark, BookmarkAiMetadata } from "@/lib/types";

type BackfillPayload = {
  processed: number;
  skipped: number;
  failed: number;
};

type SemanticBookmark = Bookmark & {
  ai_metadata?: BookmarkAiMetadata | null;
};

type LexicalSearchRow = {
  bookmark_id: string;
  lexical_score: number;
  exact_match_score: number;
  rank: number;
  match_reasons: string[] | null;
};

type SemanticSearchRow = {
  bookmark_id: string;
  similarity: number;
};

type SearchDateBounds = {
  createdAfter?: string;
  createdBefore?: string;
};

const MAX_SEARCH_QUERY_LENGTH = 500;
const TEMPORAL_RESULT_LIMIT = 100;

function shortError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Memory processing failed");
  return message.replace(/AIza[0-9A-Za-z\-_]+/g, "[redacted]").slice(0, 500);
}

function unique(values: Array<string | null | undefined>, limit = 20) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const next = String(value ?? "").trim();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    result.push(next);
    if (result.length >= limit) break;
  }

  return result;
}

function buildSemanticFields(bookmark: SemanticBookmark) {
  const ai = bookmark.ai_metadata;

  const aiDescription = bookmark.ai_description || ai?.design_context || bookmark.summary || null;

  const aiTags = unique([
    ...(bookmark.ai_tags ?? []),
    ...(ai?.suggested_tags ?? []),
    ...(ai?.visual_style ?? []),
    ...(ai?.components ?? []),
    ai?.page_type,
    ai?.industry,
  ]);

  const aiPatterns = unique([
    ...(bookmark.ai_patterns ?? []),
    ...(ai?.ui_patterns ?? []),
  ]);

  return {
    ai_description: aiDescription,
    ai_tags: aiTags,
    ai_patterns: aiPatterns,
  };
}

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user };
}

async function getSemanticBookmark(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookmarkId: string,
  userId: string,
): Promise<SemanticBookmark | null> {
  const { data, error } = await supabase
    .from("bookmarks")
    .select("*")
    .eq("id", bookmarkId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const aiMetadata = await getBookmarkAiMetadata(supabase, bookmarkId, userId);

  return {
    ...(data as Bookmark),
    ai_metadata: aiMetadata,
  };
}

async function upsertMemoryChunksForBookmark(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookmark: SemanticBookmark,
  userId: string,
) {
  const { data: visualFacts } = await supabase
    .from("bookmark_visual_facts")
    .select("*")
    .eq("bookmark_id", bookmark.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!visualFacts) return { chunks: 0, embedded: 0 };

  const chunks = buildMemoryChunks({
    bookmark,
    aiMetadata: bookmark.ai_metadata,
    visualFacts,
  });

  const rows = [];
  for (const chunk of chunks) {
    const embedding = await createBookmarkDocumentEmbedding(chunk.chunk_text);
    rows.push({
      user_id: userId,
      bookmark_id: bookmark.id,
      chunk_type: chunk.chunk_type,
      chunk_label: chunk.chunk_label,
      chunk_text: chunk.chunk_text,
      evidence: chunk.evidence,
      embedding: toPgVectorLiteral(embedding),
      model: EMBEDDING_MODEL,
      content_hash: getMemoryChunkContentHash(chunk),
      confidence: chunk.confidence,
      updated_at: new Date().toISOString(),
    });
  }

  await supabase.from("bookmark_memory_chunks").delete().eq("bookmark_id", bookmark.id).eq("user_id", userId);

  if (!rows.length) return { chunks: 0, embedded: 0 };

  const { error } = await supabase.from("bookmark_memory_chunks").insert(rows);
  if (error) throw new Error(error.message);

  return { chunks: rows.length, embedded: rows.length };
}

async function getBookmarksByIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  ids: string[],
  bounds: SearchDateBounds = {},
) {
  if (!ids.length) return new Map<string, Bookmark>();

  let query = supabase.from("bookmarks").select("*").eq("user_id", userId).in("id", ids);
  if (bounds.createdAfter) query = query.gte("created_at", bounds.createdAfter);
  if (bounds.createdBefore) query = query.lt("created_at", bounds.createdBefore);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const bookmarks = await attachAiMetadataToBookmarks(supabase, (data ?? []) as Bookmark[], userId);
  return new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]));
}

function visualReasons(bookmark: Bookmark) {
  return unique(
    [
      ...(bookmark.visual_match_evidence?.map((evidence) => evidence.label) ?? []),
      ...(bookmark.semantic_match_reasons ?? []),
    ],
    BOOKMARK_SEARCH_CONFIG.reasonLimit,
  );
}

function toSearchResult(bookmark: Bookmark, candidate: FusedSearchCandidate): BookmarkSearchResult {
  const matchLabel =
    candidate.searchMode === "exact"
      ? "Exact visual match"
      : candidate.searchMode === "hybrid"
        ? "Strong visual match"
        : candidate.searchMode === "semantic"
          ? "Possible match"
          : "Related";

  const matchStrength =
    candidate.searchMode === "exact"
      ? "exact"
      : candidate.searchMode === "hybrid"
        ? "strong"
        : candidate.searchMode === "semantic"
          ? "possible"
          : "related";

  return {
    ...bookmark,
    search_score: candidate.searchScore,
    search_mode: candidate.searchMode,
    search_match_reasons: candidate.reasons,
    lexical_score: candidate.lexicalScore || undefined,
    exact_match_score: candidate.exactMatchScore || undefined,
    semantic_similarity: candidate.semanticSimilarity || bookmark.semantic_similarity,
    semantic_match_reasons: candidate.reasons,
    match_label: matchLabel,
    match_strength: matchStrength,
  };
}

function temporalPayload(filter: TemporalFilter | null): BookmarkSearchPayload["temporalFilter"] {
  if (!filter) return undefined;
  return {
    kind: filter.kind,
    label: filter.label,
    startUtc: filter.startUtc,
    endUtc: filter.endUtc,
  };
}

function boundsFromTemporal(filter: TemporalFilter | null): SearchDateBounds {
  if (!filter) return {};
  return {
    createdAfter: filter.startUtc,
    createdBefore: filter.endUtc,
  };
}

function temporalReason(filter: TemporalFilter) {
  return `Saved: ${filter.label}`;
}

function temporalEmptyMessage(filter: TemporalFilter, isDateOnly: boolean) {
  const label = filter.label.toLowerCase();
  if (isDateOnly) {
    if (filter.label === "Today") return "No bookmarks saved today";
    if (filter.label === "Yesterday") return "No bookmarks saved yesterday";
    return `No bookmarks found for ${filter.label}`;
  }
  return `No matching bookmarks saved ${label}`;
}

async function searchLexicalCandidates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  query: string,
  bounds: SearchDateBounds = {},
): Promise<{ rows: LexicalSearchRow[]; error?: string }> {
  const { data, error } = await supabase.rpc("search_bookmarks_lexical_v2", {
    search_query: query,
    result_limit: BOOKMARK_SEARCH_CONFIG.lexicalCandidateLimit,
    created_after: bounds.createdAfter ?? null,
    created_before: bounds.createdBefore ?? null,
  });

  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as LexicalSearchRow[] };
}

async function searchSemanticCandidates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  query: string,
  bounds: SearchDateBounds = {},
): Promise<{ rows: SemanticSearchRow[]; configured: boolean; error?: string }> {
  try {
    const embedding = await createBookmarkQueryEmbedding(query);
    const { data, error } = await supabase.rpc("match_bookmarks_by_embedding_v2", {
      query_embedding: toPgVectorLiteral(embedding),
      match_user_id: userId,
      match_count: BOOKMARK_SEARCH_CONFIG.semanticCandidateLimit,
      similarity_threshold: BOOKMARK_SEARCH_CONFIG.minimumSemanticSimilarity,
      minimum_schema_version: BOOKMARK_RETRIEVAL_SCHEMA_VERSION,
      created_after: bounds.createdAfter ?? null,
      created_before: bounds.createdBefore ?? null,
    });

    if (error) return { rows: [], configured: true, error: error.message };
    return { rows: (data ?? []) as SemanticSearchRow[], configured: true };
  } catch (error) {
    const message = shortError(error);
    return { rows: [], configured: !message.includes("GEMINI_API_KEY"), error: message };
  }
}

async function getTemporalBookmarks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  filter: TemporalFilter,
) {
  const bounds = boundsFromTemporal(filter);
  let query = supabase
    .from("bookmarks")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(TEMPORAL_RESULT_LIMIT);

  if (bounds.createdAfter) query = query.gte("created_at", bounds.createdAfter);
  if (bounds.createdBefore) query = query.lt("created_at", bounds.createdBefore);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const bookmarks = await attachAiMetadataToBookmarks(supabase, (data ?? []) as Bookmark[], userId);
  return bookmarks.map((bookmark) => ({
    ...bookmark,
    search_score: 1,
    search_mode: "temporal" as const,
    search_match_reasons: [temporalReason(filter)],
    semantic_match_reasons: [temporalReason(filter)],
  }));
}

export async function processBookmarkSemanticData(bookmarkId: string): Promise<ActionResult<Bookmark>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const bookmark = await getSemanticBookmark(supabase, bookmarkId, user.id);
  if (!bookmark) return { success: false, error: "Bookmark not found" };

  await supabase
    .from("bookmarks")
    .update({ semantic_status: "processing", semantic_error: null })
    .eq("id", bookmarkId)
    .eq("user_id", user.id);

  try {
    const semanticFields = buildSemanticFields(bookmark);
    const semanticBookmark = { ...bookmark, ...semanticFields };
    const memoryText = buildBookmarkMemoryText(semanticBookmark);
    const contentHash = getBookmarkMemoryContentHash(memoryText);

    const { data: existing } = await supabase
      .from("bookmark_embeddings")
      .select("content_hash, model, retrieval_schema_version")
      .eq("bookmark_id", bookmarkId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (
      existing?.content_hash === contentHash &&
      existing.model === EMBEDDING_MODEL &&
      existing.retrieval_schema_version === BOOKMARK_RETRIEVAL_SCHEMA_VERSION &&
      bookmark.semantic_status === "ready"
    ) {
      const { data: skipped } = await supabase
        .from("bookmarks")
        .update({
          ...semanticFields,
          semantic_status: "ready",
          semantic_error: null,
          semantic_processed_at: new Date().toISOString(),
        })
        .eq("id", bookmarkId)
        .eq("user_id", user.id)
        .select()
        .single();

      return { success: true, data: skipped as Bookmark };
    }

    const embedding = await createBookmarkDocumentEmbedding(memoryText);
    await upsertMemoryChunksForBookmark(supabase, semanticBookmark, user.id).catch((chunkError) => {
      console.warn("[semantic] visual memory chunk refresh skipped:", shortError(chunkError));
    });

    const { error: embeddingError } = await supabase.from("bookmark_embeddings").upsert(
      {
        user_id: user.id,
        bookmark_id: bookmarkId,
        embedding: toPgVectorLiteral(embedding),
        embedding_text: memoryText,
        model: EMBEDDING_MODEL,
        content_hash: contentHash,
        retrieval_schema_version: BOOKMARK_RETRIEVAL_SCHEMA_VERSION,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "bookmark_id" },
    );

    if (embeddingError) throw new Error(embeddingError.message);

    const { data: updated, error: updateError } = await supabase
      .from("bookmarks")
      .update({
        ...semanticFields,
        semantic_status: "ready",
        semantic_error: null,
        semantic_processed_at: new Date().toISOString(),
      })
      .eq("id", bookmarkId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError) throw new Error(updateError.message);

    revalidatePath("/");
    revalidatePath(`/bookmarks/${bookmarkId}`);

    return { success: true, data: updated as Bookmark };
  } catch (error) {
    const message = shortError(error);
    const status = message.includes("GEMINI_API_KEY") ? "skipped" : "failed";

    await supabase
      .from("bookmarks")
      .update({
        semantic_status: status,
        semantic_error: message,
        semantic_processed_at: new Date().toISOString(),
      })
      .eq("id", bookmarkId)
      .eq("user_id", user.id);

    revalidatePath("/");
    revalidatePath(`/bookmarks/${bookmarkId}`);

    return { success: false, error: message };
  }
}

export async function processAllBookmarksSemanticData(): Promise<ActionResult<BackfillPayload>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("bookmarks")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return { success: false, error: error.message };

  const bookmarks = (data ?? []) as Bookmark[];
  const targets = bookmarks.filter((bookmark) => bookmark.semantic_status !== "processing").slice(0, 20);

  const counts: BackfillPayload = { processed: 0, skipped: 0, failed: 0 };

  for (const bookmark of targets) {
    const result = await processBookmarkSemanticData(bookmark.id);
    if (result.success) counts.processed += 1;
    else if (result.error.includes("GEMINI_API_KEY")) counts.skipped += 1;
    else counts.failed += 1;
  }

  revalidatePath("/");
  revalidatePath("/profile");

  return { success: true, data: counts };
}

export async function searchBookmarks(input: BookmarkSearchRequest | string): Promise<ActionResult<BookmarkSearchPayload>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const request: BookmarkSearchRequest =
    typeof input === "string"
      ? { query: input, timeZone: "UTC" }
      : { ...input, query: input.query };
  const trimmed = request.query.replace(/\s+/g, " ").trim().slice(0, MAX_SEARCH_QUERY_LENGTH);
  const parsed = parseBookmarkSearchQuery({
    query: trimmed,
    timeZone: request.timeZone || "UTC",
    locale: request.locale,
  });
  const effectiveQuery = parsed.temporal ? parsed.residualQuery : trimmed;
  const temporal = parsed.temporal;
  const bounds = boundsFromTemporal(temporal);

  if (!temporal && trimmed.length < BOOKMARK_SEARCH_CONFIG.minQueryLength) {
    return {
      success: true,
      data: {
        bookmarks: [],
        query: trimmed,
        effectiveQuery: trimmed,
        mode: "keyword",
        result_count: 0,
        semantic_available: true,
        lexical_available: true,
        configured: true,
        usedSemantic: false,
        totalCandidates: 0,
      },
    };
  }

  if (temporal && parsed.isDateOnlyQuery) {
    try {
      const bookmarks = await getTemporalBookmarks(supabase, user.id, temporal);
      return {
        success: true,
        data: {
          bookmarks,
          query: trimmed,
          effectiveQuery,
          mode: "temporal",
          result_count: bookmarks.length,
          semantic_available: true,
          lexical_available: true,
          configured: true,
          usedSemantic: false,
          totalCandidates: bookmarks.length,
          temporalFilter: temporalPayload(temporal),
          message: bookmarks.length ? undefined : temporalEmptyMessage(temporal, true),
        },
      };
    } catch (error) {
      return { success: false, error: shortError(error) };
    }
  }

  if (effectiveQuery.length < BOOKMARK_SEARCH_CONFIG.minQueryLength) {
    return {
      success: true,
      data: {
        bookmarks: [],
        query: trimmed,
        effectiveQuery,
        mode: temporal ? "temporal" : "keyword",
        result_count: 0,
        semantic_available: true,
        lexical_available: true,
        configured: true,
        usedSemantic: false,
        totalCandidates: 0,
        temporalFilter: temporalPayload(temporal),
        message: temporal ? temporalEmptyMessage(temporal, true) : undefined,
      },
    };
  }

  const [lexical, semantic] = await Promise.all([
    searchLexicalCandidates(supabase, effectiveQuery, bounds),
    searchSemanticCandidates(supabase, user.id, effectiveQuery, bounds),
  ]);

  const candidates: SearchCandidateInput[] = [
    ...lexical.rows.map((row, index) => ({
      bookmarkId: row.bookmark_id,
      lexicalRank: index,
      lexicalScore: row.lexical_score,
      exactMatchScore: row.exact_match_score,
      reasons: row.match_reasons ?? undefined,
    })),
    ...semantic.rows.map((row, index) => ({
      bookmarkId: row.bookmark_id,
      semanticRank: index,
      semanticSimilarity: row.similarity,
      reasons: ["Semantic memory match"],
    })),
  ];

  let visualCandidates = 0;
  const visualById = new Map<string, Bookmark>();
  if (process.env.VISUAL_MEMORY_SEARCH_ENABLED?.trim().toLowerCase() !== "false") {
    try {
      const visual = await searchBookmarksHybridVisual({
        supabase,
        userId: user.id,
        query: effectiveQuery,
        limit: BOOKMARK_SEARCH_CONFIG.visualCandidateLimit,
        createdAfter: bounds.createdAfter,
        createdBefore: bounds.createdBefore,
      });

      const usableVisualResults = visual.bookmarks.filter((bookmark) => {
        const visualScore = bookmark.visual_score_breakdown?.final ?? bookmark.semantic_similarity ?? 0;
        return (
          visual.queryUnderstanding.hasVisualConstraints ||
          visualScore >= BOOKMARK_SEARCH_CONFIG.minimumVisualScore ||
          (bookmark.visual_match_evidence?.length ?? 0) > 0
        );
      });

      visualCandidates = usableVisualResults.length;
      usableVisualResults.forEach((bookmark, index) => {
        visualById.set(bookmark.id, bookmark);
        candidates.push({
          bookmarkId: bookmark.id,
          visualRank: index,
          visualScore: bookmark.visual_score_breakdown?.final ?? bookmark.semantic_similarity ?? 0,
          semanticSimilarity: bookmark.semantic_similarity,
          reasons: visualReasons(bookmark),
        });
      });
    } catch (error) {
      console.warn("[search] visual candidate search skipped:", shortError(error));
    }
  }

  const fused = fuseSearchCandidates(candidates);
  const strong = filterStrongSearchResults(fused);
  const ids = strong.map((candidate) => candidate.bookmarkId);
  const bookmarkById = await getBookmarksByIds(supabase, user.id, ids, bounds);

  const bookmarks = strong
    .map((candidate) => {
      const base = bookmarkById.get(candidate.bookmarkId);
      if (!base) return null;
      const visual = visualById.get(candidate.bookmarkId);
      return toSearchResult({ ...base, ...visual }, candidate);
    })
    .filter(Boolean) as BookmarkSearchResult[];

  const mode = bookmarks[0]?.search_mode ?? "keyword";
  const message =
    bookmarks.length === 0
      ? temporal
        ? temporalEmptyMessage(temporal, false)
        : semantic.configured
          ? "No strong matches found."
          : "Keyword search is available, but memory search needs GEMINI_API_KEY."
      : lexical.error && !semantic.error
        ? "Keyword search was unavailable, so Nyabag used memory matches."
        : semantic.error && lexical.rows.length > 0
          ? "Memory search was unavailable, so Nyabag used ranked keyword matches."
          : undefined;

  return {
    success: true,
    data: {
      bookmarks,
      query: trimmed,
      effectiveQuery,
      mode,
      result_count: bookmarks.length,
      semantic_available: semantic.configured && !semantic.error,
      lexical_available: !lexical.error,
      configured: !lexical.error || semantic.configured,
      usedSemantic: semantic.rows.length > 0,
      totalCandidates: fused.length,
      temporalFilter: temporalPayload(temporal),
      message,
      debug: isBookmarkSearchDebugEnabled()
        ? {
            lexical_candidates: lexical.rows.length,
            semantic_candidates: semantic.rows.length,
            visual_candidates: visualCandidates,
            fused_candidates: fused.length,
          }
        : undefined,
    },
  };
}

export async function searchBookmarksByMemory(
  query: string,
  options?: { timeZone?: string; locale?: string },
): Promise<ActionResult<BookmarkSearchPayload>> {
  return searchBookmarks({
    query,
    timeZone: options?.timeZone ?? "UTC",
    locale: options?.locale,
  });
}

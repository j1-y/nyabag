import "server-only";

export type CortexBookmarkIngestPayload = {
  nyabagBookmarkId: string;
  userId: string;
  url: string;
  title?: string | null;
  summary?: string | null;
  screenshotUrl?: string | null;
};

export type CortexBookmarkIngestResponse = {
  memoryId?: string;
  autoTags?: string[];
};

export type CortexBookmarkDeletePayload = {
  nyabagBookmarkId: string;
  userId: string;
  memoryId?: string | null;
};

export type CortexBookmarkDeleteResponse = {
  deletedMemories: number;
  deletedEmbeddings: number;
};

export type CortexSearchResult = {
  memoryId?: string;
  nyabagBookmarkId?: string;
  userId?: string;
  title?: string;
  url?: string;
  similarity?: number;
  autoTags?: string[];
  visualPreview?: string;
  contentPreview?: string;
};

export type CortexSearchResponse = {
  query?: string;
  count?: number;
  results?: CortexSearchResult[];
};

export type CortexSearchParams = {
  query: string;
  userId: string;
  limit?: number;
};

function getCortexApiUrl() {
  return process.env.CORTEX_API_URL?.trim().replace(/\/+$/, "") || "";
}

let hasLoggedMissingCortexApiUrl = false;
let hasLoggedMissingCortexInternalKey = false;
const CORTEX_DELETE_TIMEOUT_MS = 5_000;

export function isCortexConfigured() {
  return Boolean(getCortexApiUrl());
}

function getCortexInternalApiKey() {
  return process.env.CORTEX_INTERNAL_API_KEY?.trim() || "";
}

function shortCortexError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Cortex request failed");
  return message.slice(0, 500);
}

async function safeResponseText(response: Response) {
  return (await response.text().catch(() => "")).slice(0, 500);
}

export async function ingestBookmarkToCortex(
  payload: CortexBookmarkIngestPayload
): Promise<CortexBookmarkIngestResponse | null> {
  const apiUrl = getCortexApiUrl();
  if (!apiUrl) {
    if (!hasLoggedMissingCortexApiUrl) {
      console.warn("[cortex] CORTEX_API_URL is not configured; skipping bookmark ingest.");
      hasLoggedMissingCortexApiUrl = true;
    }
    return null;
  }

  const screenshotUrl = payload.screenshotUrl?.trim();
  if (!screenshotUrl) {
    console.warn("[cortex] Skipping bookmark ingest because screenshot URL is missing.", {
      bookmarkId: payload.nyabagBookmarkId,
    });
    return null;
  }

  try {
    const response = await fetch(`${apiUrl}/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nyabagBookmarkId: payload.nyabagBookmarkId,
        userId: payload.userId,
        url: payload.url,
        title: payload.title ?? null,
        summary: payload.summary ?? null,
        screenshotUrl,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn("[cortex] Bookmark ingest failed:", response.status, await safeResponseText(response));
      return null;
    }

    return (await response.json().catch(() => null)) as CortexBookmarkIngestResponse | null;
  } catch (error) {
    console.warn("[cortex] Bookmark ingest failed:", shortCortexError(error));
    return null;
  }
}

export async function deleteBookmarkFromCortex(
  payload: CortexBookmarkDeletePayload
): Promise<CortexBookmarkDeleteResponse | null> {
  const apiUrl = getCortexApiUrl();
  if (!apiUrl) return null;

  const internalApiKey = getCortexInternalApiKey();
  if (!internalApiKey) {
    if (!hasLoggedMissingCortexInternalKey) {
      console.warn("[cortex] CORTEX_INTERNAL_API_KEY is not configured; skipping bookmark delete cleanup.");
      hasLoggedMissingCortexInternalKey = true;
    }
    return null;
  }

  const bookmarkId = payload.nyabagBookmarkId.trim();
  const userId = payload.userId.trim();
  if (!bookmarkId || !userId) return null;

  const params = new URLSearchParams({ userId });

  try {
    const response = await fetch(`${apiUrl}/memories/bookmark/${encodeURIComponent(bookmarkId)}?${params.toString()}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${internalApiKey}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(CORTEX_DELETE_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn("[cortex] Bookmark delete cleanup failed:", {
        status: response.status,
        body: await safeResponseText(response),
        bookmarkId,
        memoryId: payload.memoryId ?? null,
      });
      return null;
    }

    return (await response.json().catch(() => null)) as CortexBookmarkDeleteResponse | null;
  } catch (error) {
    console.warn("[cortex] Bookmark delete cleanup failed:", {
      error: shortCortexError(error),
      bookmarkId,
      memoryId: payload.memoryId ?? null,
    });
    return null;
  }
}

export async function searchCortex({
  query,
  userId,
  limit = 20,
}: CortexSearchParams): Promise<CortexSearchResponse | null> {
  const apiUrl = getCortexApiUrl();
  const trimmed = query.trim();
  const scopedUserId = userId.trim();
  if (!apiUrl || !trimmed || !scopedUserId) return null;

  const params = new URLSearchParams({
    q: trimmed,
    limit: String(limit),
    userId: scopedUserId,
  });

  try {
    const response = await fetch(`${apiUrl}/search?${params.toString()}`, {
      headers: {
        "X-Nyabag-User-Id": scopedUserId,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn("[cortex] Search failed:", response.status, await safeResponseText(response));
      return null;
    }

    return (await response.json().catch(() => null)) as CortexSearchResponse | null;
  } catch (error) {
    console.warn("[cortex] Search failed:", shortCortexError(error));
    return null;
  }
}

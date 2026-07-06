import "server-only";

export type CortexBookmarkIngestPayload = {
  nyabagBookmarkId: string;
  userId: string;
  url: string;
  title?: string | null;
  summary?: string | null;
  screenshotUrl?: string | null;
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

export function isCortexConfigured() {
  return Boolean(getCortexApiUrl());
}

function shortCortexError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Cortex request failed");
  return message.slice(0, 500);
}

export async function ingestBookmarkToCortex(
  payload: CortexBookmarkIngestPayload
): Promise<CortexSearchResponse | null> {
  const apiUrl = getCortexApiUrl();
  if (!apiUrl) {
    console.warn("[cortex] CORTEX_API_URL is not configured; skipping bookmark ingest.");
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
        screenshotUrl: payload.screenshotUrl ?? null,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn("[cortex] Bookmark ingest failed:", response.status, await response.text().catch(() => ""));
      return null;
    }

    return (await response.json().catch(() => null)) as CortexSearchResponse | null;
  } catch (error) {
    console.warn("[cortex] Bookmark ingest failed:", shortCortexError(error));
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
      console.warn("[cortex] Search failed:", response.status, await response.text().catch(() => ""));
      return null;
    }

    return (await response.json().catch(() => null)) as CortexSearchResponse | null;
  } catch (error) {
    console.warn("[cortex] Search failed:", shortCortexError(error));
    return null;
  }
}

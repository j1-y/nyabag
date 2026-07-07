# Nyabag Performance Notes

## Current Strategy

Nyabag keeps private Supabase data uncached by default and optimizes perceived speed through fast mutations, local UI state, and small server queries. Use `src/lib/perf.ts` for lightweight timing. Development logs are enabled automatically; production logs require `NEXT_PUBLIC_DEBUG_PERF=true`.

## Bookmark Enrichment

Bookmark creation inserts a basic row immediately with `processing_status = 'queued'`, fallback title, user-entered tags/note, fallback design data, and no screenshot. Heavy metadata extraction, screenshot generation, optimization, storage upload, and final row update run in Oracle, which polls Supabase `bookmark_processing_jobs`.

The app does not dispatch GitHub Actions for bookmark processing. It only enqueues work and returns immediately; Oracle owns job claiming, retries, screenshots, metadata, and ready/failed status updates.

Processing states:
- `queued`: row is visible and waiting for the worker.
- `processing`: row is visible and enrichment is running.
- `ready`: metadata/screenshot enrichment completed.
- `failed`: enrichment failed; the bookmark remains usable with fallback UI.

## Caching Rules

Do not globally cache private bookmark, profile, or canvas data unless the cache key includes `user.id` and every mutation invalidates it. LocalStorage is allowed only for non-sensitive UI preferences such as dashboard filter and canvas viewport. Do not store private bookmark content, notes, media URLs, or signed URLs in LocalStorage.

Bookmark screenshots are public storage objects with long cache control. New screenshot refreshes should use new timestamped paths so browser/CDN cache does not show stale previews.

Canvas uploaded media remains private. Signed URLs are generated with a one-hour TTL and batched with `createSignedUrls` during canvas load.

## Canvas Rendering Rules

Canvas loaders select explicit note/section columns and batch signed URL generation. For large canvases, add viewport-aware loading so only notes inside or near the current viewport are fetched initially.

Canvas viewport is isolated as non-sensitive UI state and persisted locally. The Zustand store normalizes notes and sections to prepare components for selector-based subscriptions, where individual notes subscribe only to their own data and viewport consumers subscribe only to viewport.

## Revalidation Rules

Use `revalidatePath` when a server-rendered page needs fresh data after navigation or a structural mutation. Avoid it for local-authoritative canvas mutations such as note movement, resizing, color changes, and text edits because the client already reconciles those updates and route revalidation makes interaction feel slower.

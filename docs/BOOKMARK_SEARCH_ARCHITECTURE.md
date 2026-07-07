# Bookmark Search Architecture

Nyabag active bookmark search is backed by hosted Cortex. Supabase remains the source of truth for bookmark records, ownership, folders, screenshots, and metadata. Cortex returns ranked bookmark identifiers only; Nyabag filters those identifiers through Supabase before anything reaches the client.

## Active Search Flow

1. The dashboard keeps the normal in-memory bookmark list for empty search, tag filters, and the recent filter.
2. A non-empty query of at least two characters is debounced in `src/hooks/useBookmarks.tsx`.
3. The hook calls the `searchCortexBookmarks()` server action in `src/lib/actions.ts`.
4. The server action authenticates the current Supabase user.
5. `src/lib/cortex.ts` calls `GET ${CORTEX_API_URL}/search?q=...&limit=...&userId=...` with `cache: "no-store"` and an `X-Nyabag-User-Id` header.
6. Cortex must filter search candidates by that authenticated `userId` before ranking.
7. Cortex returns ranked rows containing `nyabagBookmarkId`, `userId`, and optional similarity/preview metadata.
8. Nyabag drops any returned row whose Cortex `userId` does not match the authenticated user, deduplicates IDs, and queries `bookmarks` with both `user_id = auth.user.id` and `id in (...)`.
9. The final response reorders the owner-filtered Supabase rows to match Cortex ranking.

There is no lexical, Gemini embedding, visual-memory, temporal, or fusion fallback for active searches. If Cortex is unconfigured or unavailable, active search returns a compact unavailable state and the UI shows a small Cortex-unavailable message.

## Server-Only Boundary

`CORTEX_API_URL` and `CORTEX_INTERNAL_API_KEY` are server-only and must not use the `NEXT_PUBLIC_` prefix.

`src/lib/cortex.ts` imports `server-only` and exposes:

- `ingestBookmarkToCortex(payload)`: server-only `POST /ingest` helper that refuses missing screenshot URLs.
- `deleteBookmarkFromCortex(payload)`: best-effort `DELETE /memories/bookmark/{id}` cleanup helper for deleted bookmarks.
- `ingestReadyBookmarksToCortex(limit)`: authenticated server action that posts ready bookmarks with screenshots to Cortex in small batches.
- `searchCortex({ query, userId, limit })`: user-scoped `GET /search` for active search.
- `isCortexConfigured()`: environment check used by server actions.

Both Cortex calls use `cache: "no-store"`. Ingest failures are logged and never block bookmark creation. Delete cleanup failures are logged and never block bookmark deletion.

Production safety requirement: Cortex `/search` must honor `userId` server-side. Nyabag still owner-filters returned IDs through Supabase, but that is a final guard, not a substitute for user-scoped retrieval inside Cortex.

## Ingest Scope

Cortex ingest is deferred until screenshot processing is complete.

Covered create surfaces all insert normal bookmarks first, then rely on deferred ready-bookmark ingest:

- Dashboard create.
- Onboarding first bookmark.
- Import, through the shared create action.
- Telegram queued saves.
- Extension capture creates.

Bookmark URL changes, screenshot refreshes, and processor retries reset `cortex_status` to `pending`, so the next ready screenshot can be ingested again. Title/tag/note-only edits do not reset Cortex state. Deletes best-effort call Cortex to remove matching `cortex_memories` and `cortex_embeddings` rows by Nyabag bookmark id plus user id.

Ingest tracking lives on `bookmarks`:

- `cortex_status`: `pending`, `processing`, `ready`, `failed`, or `skipped`.
- `cortex_error`: safe truncated failure detail.
- `cortex_memory_id`: Cortex memory id when returned.
- `cortex_ingested_at`: successful ingest timestamp.

## Public Payload

`searchCortexBookmarks()` returns:

- `success`
- `bookmarks`
- `query`
- `result_count`
- `configured`
- `message`

Search-result bookmarks may include:

- `search_score`
- `search_mode: "cortex"`
- `search_match_reasons`
- `semantic_similarity`

These fields are display metadata only. Bookmark identity and ownership always come from Supabase.

## Legacy Supabase Search Objects

The older Supabase search schema objects remain in the database for now:

- lexical search RPCs
- search vectors/indexes
- embedding tables/RPCs
- visual-memory tables/RPCs
- semantic status columns

They are legacy leftovers pending a future explicit migration. This Cortex replacement removed the app-side code paths and processor embedding/chunk generation without dropping database objects.

## Verification

Recommended checks:

```bash
npm run build
npm run lint
npm run check:bookmark-processor
git diff --check
```

Manual smoke:

- Set `CORTEX_API_URL` in `.env.local` and restart the dev server.
- Create a bookmark and confirm Cortex does not receive `POST /ingest` while screenshot fields are null.
- Let the processor mark the bookmark ready with `long_screenshot_url` or `screenshot_url`, then open/refresh the dashboard and confirm Cortex receives `POST /ingest`.
- Delete an ingested bookmark and confirm Cortex receives `DELETE /memories/bookmark/{id}` with the internal bearer token.
- Search a semantic query and confirm cards follow Cortex result order.
- Confirm Cortex Render logs show `/search` requests receiving the authenticated `userId`.
- Break `CORTEX_API_URL` and confirm active search shows the unavailable state instead of falling back to local results.
- Confirm empty search, tag filters, recent filter, bookmark create/delete, onboarding create, extension create, and Telegram create still work.

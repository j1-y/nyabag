# Bookmark Search Architecture

Nyabag active bookmark search is backed by hosted Cortex. Supabase remains the source of truth for bookmark records, ownership, folders, screenshots, metadata, and workspace membership. Cortex returns ranked bookmark identifiers only; Nyabag filters those identifiers through Supabase before anything reaches the client.

## Active Search Flow

1. The dashboard keeps the normal in-memory bookmark list for empty search, tag filters, and the recent filter.
2. A non-empty query of at least two characters is debounced in `src/hooks/useBookmarks.tsx`.
3. The hook calls the `searchCortexBookmarks()` server action in `src/lib/actions.ts`.
4. The server action authenticates the current Supabase user.
5. The server action resolves the active workspace from the signed-in user and the `nyabag-active-workspace-id` cookie, with membership validation and `Personal` fallback.
6. `src/lib/cortex.ts` calls `GET ${CORTEX_API_URL}/search?q=...&limit=...&userId=...&workspaceId=...` with `cache: "no-store"`, `Authorization: Bearer ${CORTEX_INTERNAL_API_KEY}`, and `X-Nyabag-User-Id` / `X-Nyabag-Workspace-Id` headers.
7. Cortex validates the internal bearer token, filters search candidates by `userId` and `workspaceId` when present, and applies evidence gating for specific visual terms before returning ranked matches.
8. Cortex returns ranked rows containing `nyabagBookmarkId`, `userId`, `workspaceId`, and optional similarity/preview metadata.
9. Nyabag drops any returned row whose Cortex `userId` does not match the authenticated user, deduplicates IDs, and queries `bookmarks` with both `user_id = auth.user.id`, `workspace_id = activeWorkspace.id`, and `id in (...)`.
10. The final response reorders the filtered Supabase rows to match Cortex ranking.

There is no lexical, Gemini embedding, visual-memory, temporal, or fusion fallback for active searches. If Cortex is unconfigured or unavailable, active search returns a compact unavailable state and the UI shows a small Cortex-unavailable message. Nyabag no longer runs app-side Gemini bookmark enrichment.

## Server-Only Boundary

`CORTEX_API_URL` and `CORTEX_INTERNAL_API_KEY` are server-only and must not use the `NEXT_PUBLIC_` prefix.

`src/lib/cortex.ts` imports `server-only` and exposes:

- `ingestBookmarkToCortex(payload)`: server-only `POST /ingest` helper that refuses missing screenshot URLs.
- `deleteBookmarkFromCortex(payload)`: best-effort `DELETE /memories/bookmark/{id}` cleanup helper for deleted bookmarks.
- `ingestReadyBookmarksToCortex(limit)`: authenticated server action that posts ready bookmarks with screenshots to Cortex in small batches.
- `searchCortex({ query, userId, workspaceId, limit })`: authenticated, workspace-scoped `GET /search` for active search.
- `isCortexConfigured()`: environment check used by server actions.

Cortex network calls use `cache: "no-store"`. Ingest failures are logged and never block bookmark creation. Delete cleanup failures are logged and never block bookmark deletion. Search returns the unavailable state if Cortex or the internal key is not configured.

Production safety requirement: Cortex `/search` must validate the internal token and honor `userId` plus `workspaceId` server-side when workspace context is supplied. Nyabag still filters returned IDs through Supabase, but that is a final guard, not a substitute for workspace-aware retrieval inside Cortex.

Specific visual searches should require evidence for the concrete term. For example, `globe design` should not return generic landing pages that only match broad words such as `design`, `clean`, or `modern`; Cortex should require evidence such as `globe`, `earth`, `world`, `global`, `planet`, or `map`.

## Ingest Scope

Cortex ingest is deferred until screenshot processing is complete.

Covered create surfaces all insert normal bookmarks first, then rely on deferred ready-bookmark ingest:

- Dashboard create.
- Onboarding first bookmark.
- Import, through the shared create action.
- Telegram queued saves.
- Extension capture creates.

Bookmark URL changes, screenshot refreshes, and processor retries reset `cortex_status` to `pending`, so the next ready screenshot can be ingested again. Title/tag/note-only edits do not reset Cortex state. Deletes best-effort call Cortex to remove matching `cortex_memories` and `cortex_embeddings` rows by Nyabag bookmark id plus user id, with workspace context when available.

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

The old Nyabag-side Gemini AI metadata layer has been removed:

- `bookmark_ai_metadata`
- `bookmark_visual_facts`
- `bookmarks.ai_description`
- `bookmarks.ai_tags`
- `bookmarks.ai_patterns`
- `bookmarks.ai_design_dna`

The older Supabase search schema objects below may still remain in historical databases for now:

- lexical search RPCs
- search vectors/indexes
- embedding tables/RPCs
- semantic status columns

They are legacy leftovers pending a future explicit migration. Active app code does not call them.

## Verification

Recommended checks:

```bash
npm run build
npm run lint
git diff --check
```

Manual smoke:

- Set `CORTEX_API_URL` in `.env.local` and restart the dev server.
- Create a bookmark and confirm Cortex does not receive `POST /ingest` while screenshot fields are null.
- Let the processor mark the bookmark ready with `long_screenshot_url` or `screenshot_url`, then open/refresh the dashboard and confirm Cortex receives `POST /ingest` with workspace context when supplied.
- Delete an ingested bookmark and confirm Cortex receives `DELETE /memories/bookmark/{id}` with the internal bearer token.
- Search a semantic query and confirm cards follow Cortex result order inside the active workspace.
- Search `globe design` and confirm only evidence-backed globe/earth/global matches appear.
- Confirm Cortex Render logs show `/search` requests receiving the internal bearer token and authenticated `userId`, plus workspace context when present.
- Break `CORTEX_API_URL` and confirm active search shows the unavailable state instead of falling back to local results.
- Confirm empty search, tag filters, recent filter, bookmark create/delete, onboarding create, extension create, and Telegram create still work across workspace switching.

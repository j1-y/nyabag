# Architecture

## Core layout

- Root app layout: `src/app/layout.tsx`
- App-only deployment for `app.nyabag.com`; no marketing, blog, about, or contact routes are present.
- Auth flows: `src/app/login/page.tsx`, `src/app/signup/page.tsx`, `src/app/onboarding/page.tsx`
- Legal support routes: `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`
- Dashboard group: `src/app/(dashboard)/layout.tsx`

## Dashboard routes

- Bookmarks home: `src/app/(dashboard)/page.tsx` at `/`
- Bookmark detail: `src/app/(dashboard)/bookmarks/[id]/page.tsx`
- Canvas: `src/app/(dashboard)/canvas/page.tsx`
- Folders: `src/app/(dashboard)/folders/[folderId]/page.tsx`
- Captures: `src/app/(dashboard)/captures/page.tsx`
- Profile: `src/app/(dashboard)/profile/page.tsx`

## Route and shell behavior

- `src/components/layout/DashboardShell.tsx` controls the desktop shell and mobile capture experience.
- `src/components/layout/MobileBookmarkCapture.tsx` is the mobile-only URL submission surface.
- `src/components/layout/DashboardSidebar.tsx` defines the main workspace navigation; `DashboardShell` renders the muted sidebar plus curved white main panel without a top feature switch.
- `src/proxy.ts` protects the root dashboard routes and redirects legacy `/app/*` URLs to root equivalents.
- `/onboarding` is the authenticated first-run flow. It renders a prototype-faithful three-step visual flow, asks users to save one real bookmark through `createBookmark(formData)` or explicitly skip, polls the created bookmark with `getOnboardingBookmarkPreview(bookmarkId)`, waits for a real `screenshot_url` before success, then calls `completeOnboarding()` and sends them to `/`. Processor failures stay in the creating step with retry/skip actions.

## Data and mutation surfaces

- Bookmark/profile/auth mutations: `src/lib/actions.ts`
- Canvas mutations: `src/lib/canvas-actions.ts`
- Folder mutations: `src/lib/folder-actions.ts`
- Onboarding mutations: `src/lib/onboarding-actions.ts`
- Admin mutations: `src/lib/admin/actions.ts`
- Semantic memory logic: `src/lib/semantic/*`
- Bookmark search config/fusion/types: `src/lib/bookmark-search/*`
- Visual memory logic: `src/lib/visual-memory/*`
- Bookmark enrichment and processor dispatch: `src/lib/bookmarks/*`

## Storage and schema

- Canonical schema: `supabase/schema.sql`
- Private canvas media bucket: `canvas-media`
- Public profile avatar bucket: `profile-avatars`
- Owner-scoped tables and RLS drive the core data model.

## Processing pipeline

- Bookmark creation inserts a row first, then triggers enrichment and processor work.
- The bookmark processor lives under `processor/*`.
- Visual-memory backfill and evaluation helpers live under `scripts/*`.
- Bookmark search reindexing lives in `scripts/reindex-bookmark-search.mjs`; fixture evaluation lives in `scripts/evaluate-bookmark-search.mjs`.
- Screenshot and metadata enrichment are intentionally best-effort and must remain fallback-safe.
- Bookmark screenshots are short top-viewport Playwright captures by default (`SCREENSHOT_FULL_PAGE=false`, `SCREENSHOT_HEIGHT=900`, `MAX_WEBP_HEIGHT=900`).

## Bookmark search architecture

- Active dashboard searches must use server-ranked results from `searchBookmarksByMemory()`/`searchBookmarks()`, not broad client-side substring unions.
- Temporal search is parsed deterministically in `src/lib/bookmark-search/temporal-query.ts`; date-only queries bypass Gemini and visual memory, while mixed date+content queries pass UTC bounds to every candidate source.
- Lexical retrieval uses `bookmarks.search_vector`, `idx_bookmarks_search_vector`, and the `search_bookmarks_lexical` RPC in `supabase/schema.sql`.
- Date-bound retrieval uses versioned `_v2` RPCs to avoid PostgREST overload ambiguity.
- Semantic retrieval uses Gemini 768-dimensional embeddings in `bookmark_embeddings` with `retrieval_schema_version`.
- Fusion and cutoff are pure TypeScript in `src/lib/bookmark-search/fusion.ts`.
- Full operational details live in `docs/BOOKMARK_SEARCH_ARCHITECTURE.md`.

## Important boundaries

- Desktop-first behavior is the default.
- Mobile capture is intentionally limited.
- Route groups under `src/app/(dashboard)` are organizational and do not change the URL.
- Legacy `/app/*` links are compatibility redirects only; do not add duplicate `/app` routes.
- Server actions must continue to enforce auth and ownership checks.
- Docs are part of the architecture: update this file when routes, flows, or boundaries change.

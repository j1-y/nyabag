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
- `/onboarding` is the authenticated first-run flow. It renders a prototype-faithful three-step visual flow, asks users to save one real bookmark through `createBookmark(formData)` or explicitly skip, polls the created bookmark with `getOnboardingBookmarkPreview(bookmarkId)`, waits for the normal top-viewport `screenshot_url` before success, then calls `completeOnboarding()` and sends them to `/`. Processor failures before that normal screenshot stay in the creating step with retry/skip actions.

## Data and mutation surfaces

- Bookmark/profile/auth mutations: `src/lib/actions.ts`
- Canvas mutations: `src/lib/canvas-actions.ts`
- Folder mutations: `src/lib/folder-actions.ts`
- Onboarding mutations: `src/lib/onboarding-actions.ts`
- Admin mutations: `src/lib/admin/actions.ts`
- Extension web-session auth: `src/app/api/extension/auth/start/route.ts`, `src/app/api/extension/auth/exchange/route.ts`, and `src/lib/extension/web-session-auth.ts`
- Hosted Cortex client, active search, and best-effort delete cleanup boundary: `src/lib/cortex.ts`; deferred ready-bookmark ingest action: `src/lib/cortex-actions.ts`
- Bookmark enrichment and processor dispatch: `src/lib/bookmarks/*`

## Storage and schema

- Canonical schema: `supabase/schema.sql`
- Extension auth handoff codes live in `extension_auth_codes`; only SHA-256 code hashes are stored, and service-role route handlers consume them exactly once.
- Private canvas media bucket: `canvas-media`
- Public profile avatar bucket: `profile-avatars`
- Owner-scoped tables and RLS drive the core data model.

## Processing pipeline

- Bookmark creation inserts a row first, then enqueues Oracle processing work.
- Cortex ingest is deferred until a bookmark has `processing_status = "ready"` and either `long_screenshot_url` or `screenshot_url`; dashboard state calls `ingestReadyBookmarksToCortex()` in small throttled batches.
- Bookmark deletion removes the Supabase row first, then best-effort calls Cortex to delete matching Neon `cortex_memories` and `cortex_embeddings` rows by bookmark id plus user id.
- Oracle is the external bookmark processor. Nyabag no longer includes the old local/GitHub `processor/` worker; `triggerBookmarkProcessor()` is a server-only no-op that documents Oracle polling.
- Screenshot and metadata enrichment are intentionally best-effort and must remain fallback-safe.
- Oracle processing captures two screenshots per URL job: a normal top-viewport WebP stored in `screenshot_url` for onboarding, then a long full-page WebP stored in `long_screenshot_url` for dashboard cards, folder cards, detail pages, and Cortex ingest. App display falls back to `screenshot_url` when `long_screenshot_url` is missing.

## Bookmark search architecture

- Active dashboard searches must use Cortex via `searchCortexBookmarks()` in `src/lib/actions.ts`; do not reintroduce app-side lexical/Gemini/visual/fusion fallback for active queries.
- Empty search still uses the loaded local bookmark list with tag and recent filters.
- `CORTEX_API_URL` and `CORTEX_INTERNAL_API_KEY` are server-only and required for active search. If either is missing or broken, the active search UI shows a Cortex-unavailable state.
- Cortex validates the internal token, scopes retrieval by `userId`, applies evidence gating for specific visual terms, and returns ranked `nyabagBookmarkId` values. Nyabag must still owner-filter those IDs through Supabase and return bookmark rows in Cortex order.
- `bookmarks.cortex_status` tracks deferred ingest separately from legacy `semantic_status`.
- `CORTEX_INTERNAL_API_KEY` is also required for destructive Cortex cleanup endpoints.
- Legacy Nyabag-side Gemini AI metadata is removed. Do not reintroduce `bookmark_ai_metadata`, `bookmark_visual_facts`, bookmark `ai_*` fields, or app-side Gemini enrichment; Cortex owns AI memory/search.
- Full operational details live in `docs/BOOKMARK_SEARCH_ARCHITECTURE.md`.

## Important boundaries

- Desktop-first behavior is the default.
- Mobile capture is intentionally limited.
- Route groups under `src/app/(dashboard)` are organizational and do not change the URL.
- Legacy `/app/*` links are compatibility redirects only; do not add duplicate `/app` routes.
- Server actions must continue to enforce auth and ownership checks.
- Chrome extension web-session login requires `NYABAG_CHROME_EXTENSION_IDS` and only accepts `https://<allowed-id>.chromiumapp.org/nyabag-auth` redirect URIs.
- Unauthenticated extension start requests redirect to `/login?next=<original start url>`, and the login/signup pages preserve that `next` value so the extension auth flow resumes after web auth instead of dropping into the normal dashboard path.
- Extension bearer-auth failures return stable `AUTH_*` codes alongside their existing status and message so extension clients can show actionable diagnostics without exposing credentials.
- Extension clients bind stored sessions to the API origin and validate exchanged or cookie-derived sessions through `/api/extension/me`; screenshot binaries use `/api/extension/captures`, while bookmark-style saves use `/api/extension/capture`.
- Docs are part of the architecture: update this file when routes, flows, or boundaries change.

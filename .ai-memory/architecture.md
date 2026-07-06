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
- Hosted Cortex client and active search boundary: `src/lib/cortex.ts`
- Bookmark enrichment and processor dispatch: `src/lib/bookmarks/*`

## Storage and schema

- Canonical schema: `supabase/schema.sql`
- Private canvas media bucket: `canvas-media`
- Public profile avatar bucket: `profile-avatars`
- Owner-scoped tables and RLS drive the core data model.

## Processing pipeline

- Bookmark creation inserts a row first, then triggers enrichment and processor work.
- Bookmark creation also sends a best-effort server-only Cortex `/ingest` request when `CORTEX_API_URL` is configured; Cortex failures must not block creation.
- The bookmark processor lives under `processor/*`.
- Screenshot and metadata enrichment are intentionally best-effort and must remain fallback-safe.
- Bookmark processing captures two screenshots per URL job: a normal top-viewport WebP stored in `screenshot_url` for onboarding, then a long full-page WebP stored in `long_screenshot_url` for dashboard cards, folder cards, detail pages, AI metadata, and visual facts. App display falls back to `screenshot_url` when `long_screenshot_url` is missing.

## Bookmark search architecture

- Active dashboard searches must use Cortex via `searchCortexBookmarks()` in `src/lib/actions.ts`; do not reintroduce app-side lexical/Gemini/visual/fusion fallback for active queries.
- Empty search still uses the loaded local bookmark list with tag and recent filters.
- `CORTEX_API_URL` is server-only and required for active search. If missing or broken, the active search UI shows a Cortex-unavailable state.
- Cortex returns ranked `nyabagBookmarkId` values only. Nyabag must owner-filter those IDs through Supabase and return bookmark rows in Cortex order.
- Legacy Supabase search objects remain in `supabase/schema.sql` until a future explicit cleanup migration; treat them as inactive leftovers, not active app architecture.
- Full operational details live in `docs/BOOKMARK_SEARCH_ARCHITECTURE.md`.

## Important boundaries

- Desktop-first behavior is the default.
- Mobile capture is intentionally limited.
- Route groups under `src/app/(dashboard)` are organizational and do not change the URL.
- Legacy `/app/*` links are compatibility redirects only; do not add duplicate `/app` routes.
- Server actions must continue to enforce auth and ownership checks.
- Docs are part of the architecture: update this file when routes, flows, or boundaries change.

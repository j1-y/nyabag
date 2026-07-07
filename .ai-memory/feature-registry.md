# Feature Registry

## Bookmarks

- Feature: Bookmark dashboard
- Description: Main saved-inspiration workspace with cards, filtering, pending creation, deferred Cortex ingest for ready screenshots, best-effort Cortex cleanup on delete, Cortex-backed active search, detail views, sidebar-only app navigation, and a fixed bottom search dock over a non-interactive main-content fade.
- Key Files: `src/app/(dashboard)/page.tsx`, `src/components/bookmarks/*`, `src/hooks/useBookmarks.tsx`, `src/lib/actions.ts`, `src/lib/cortex.ts`, `src/lib/cortex-actions.ts`, `src/lib/bookmarks/*`, `src/lib/data.ts`, `src/lib/metadata.ts`, `supabase/schema.sql`
- Dependencies: Supabase auth, bookmark tables, hosted Cortex, normal onboarding screenshot plus long app screenshot enrichment, optional processor jobs
- Status: Active

## Bookmark Search

- Feature: Cortex bookmark search
- Description: Ready bookmarks with screenshots are ingested to hosted Cortex, and active bookmark search calls Cortex, owner-filters returned `nyabagBookmarkId` values through Supabase, and returns cards in Cortex order. Empty search remains the local bookmark list with tag/recent filters.
- Key Files: `src/lib/cortex.ts`, `src/lib/cortex-actions.ts`, `src/lib/actions.ts`, `src/hooks/useBookmarks.tsx`, `src/components/bookmarks/BookmarkSearchBar.tsx`, `src/components/bookmarks/BookmarkGrid.tsx`, `docs/BOOKMARK_SEARCH_ARCHITECTURE.md`, `supabase/schema.sql`
- Dependencies: Supabase RLS, server-only `CORTEX_API_URL`, server-only `CORTEX_INTERNAL_API_KEY`, `bookmarks.cortex_status`, Cortex `/ingest`, `/search`, and delete cleanup
- Status: Active

## Canvas

- Feature: Infinite canvas
- Description: Desktop-first visual workspace for notes, media, links, embeds, sections, drag-resize interactions, and sidebar-only app navigation.
- Key Files: `src/app/(dashboard)/canvas/page.tsx`, `src/components/canvas/*`, `src/hooks/useNotes.tsx`, `src/lib/canvas-actions.ts`, `src/lib/canvas-data.ts`, `src/lib/social-embeds.ts`, `supabase/schema.sql`
- Dependencies: Supabase auth, storage, signed URLs, route-level loading UI
- Status: Active

## Mobile Capture

- Feature: Mobile URL capture
- Description: Constrained mobile experience that lets authenticated users submit URLs without opening the full desktop workspace.
- Key Files: `src/components/layout/MobileBookmarkCapture.tsx`, `src/components/layout/DashboardShell.tsx`, `src/app/(dashboard)/layout.tsx`, `src/lib/actions.ts`
- Dependencies: Supabase auth, bookmark creation pipeline
- Status: Active

## Profile

- Feature: Profile settings
- Description: User profile editor with avatar upload plus Telegram-related panels.
- Key Files: `src/app/(dashboard)/profile/page.tsx`, `src/components/profile/*`, `src/lib/profile.ts`, `src/lib/actions.ts`
- Dependencies: Supabase auth, `profile-avatars` storage bucket
- Status: Active

## Folders

- Feature: Folder hierarchy
- Description: Nested bookmark organization with inbox, breadcrumbs, move, rename, and delete flows.
- Key Files: `src/app/(dashboard)/folders/[folderId]/page.tsx`, `src/components/folders/*`, `src/lib/folder-actions.ts`, `src/lib/folders.ts`, `supabase/schema.sql`
- Dependencies: Bookmark tables, folder tables, Supabase auth
- Status: Active

## Design DNA

- Feature: Design DNA extraction
- Description: Coming-soon saved styleguide surface; supporting code exists, but no live route is currently mounted.
- Key Files: `src/lib/design-dna/*`, `src/components/design-dna/*`, `src/lib/actions.ts`
- Dependencies: Bookmark data, extraction pipeline, screenshot data
- Status: Unrouted

## Onboarding

- Feature: First-memory onboarding
- Description: Prototype-faithful first-run flow that demonstrates Nyabag by asking users to save one real bookmark through the normal bookmark pipeline, animating idle/website-skeleton creating/success states, polling real preview status, waiting for the normal top-viewport `screenshot_url` before success, and offering retry/skip/open actions into the dashboard.
- Key Files: `src/app/onboarding/page.tsx`, `src/components/onboarding/*`, `src/lib/onboarding.ts`, `src/lib/onboarding-actions.ts`, `src/lib/actions.ts`
- Dependencies: Supabase auth, onboarding table/state, bookmark creation pipeline, bookmark preview processing status, retry bookmark processing action, favicon route
- Status: Active

## Admin

- Feature: Admin console
- Description: Internal management surfaces for users, logs, emails, storage, settings, and early access.
- Key Files: `src/app/admin/*`, `src/components/admin/*`, `src/lib/admin/*`
- Dependencies: Admin auth, service-role access, email provider, Supabase data
- Status: Active

## Legal Support

- Feature: Legal support pages
- Description: Public privacy and terms pages retained for the app-only deployment.
- Key Files: `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`
- Dependencies: Public metadata
- Status: Active

## Extension

- Feature: Browser extension API
- Description: API routes that support browser-extension auth, capture, upload, and commit flows.
- Key Files: `src/app/api/extension/*`, `src/lib/extension/*`
- Dependencies: Supabase auth, CORS rules, capture storage, extension client state
- Status: Active

## Future Features

- Browser Extension
- Figma Integration
- Cortex search observability and stale-ID cleanup tools
- More robust processor observability

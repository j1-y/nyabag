# Feature Registry

## Workspaces

- Feature: First-party personal workspaces
- Description: Authenticated users can create, switch, and rename owner-scoped workspaces. The active workspace is resolved server-side from `nyabag-active-workspace-id` with membership validation, newest-membership fallback, and automatic `Personal` creation. V1 has no delete, invites, billing, sharing, or collaboration UI.
- Key Files: `src/lib/workspaces.ts`, `src/lib/workspace-actions.ts`, `src/components/workspaces/*`, `src/app/(dashboard)/layout.tsx`, `src/components/layout/DashboardSidebar.tsx`, `supabase/schema.sql`
- Dependencies: Supabase auth, `workspaces`, `workspace_members`, workspace-scoped content tables, dashboard shell
- Status: Active

## Bookmarks

- Feature: Bookmark dashboard
- Description: Main saved-inspiration surface with cards, filtering, pending creation, deferred Cortex ingest for ready screenshots, best-effort Cortex cleanup on delete, Cortex-backed active search, detail views, sidebar-only app navigation, and a fixed bottom search dock over a non-interactive main-content fade. Bookmark create, import, update, delete, list, detail, folder, inbox, processing, and search paths are scoped to the active workspace.
- Key Files: `src/app/(dashboard)/page.tsx`, `src/components/bookmarks/*`, `src/hooks/useBookmarks.tsx`, `src/lib/actions.ts`, `src/lib/cortex.ts`, `src/lib/cortex-actions.ts`, `src/lib/bookmarks/*`, `src/lib/data.ts`, `src/lib/metadata.ts`, `supabase/schema.sql`
- Dependencies: Supabase auth, bookmark tables, hosted Cortex, Oracle screenshot/metadata processing, normal onboarding screenshot plus long app screenshot enrichment; no app-side Gemini bookmark enrichment
- Status: Active

## Bookmark Search

- Feature: Cortex bookmark search
- Description: Ready bookmarks with screenshots are ingested to hosted Cortex with workspace context when available, and active bookmark search calls internal-token-authenticated Cortex search, filters returned `nyabagBookmarkId` values through active-workspace Supabase queries, and returns evidence-gated cards in Cortex order. Empty search remains the workspace-local bookmark list with tag/recent filters.
- Key Files: `src/lib/cortex.ts`, `src/lib/cortex-actions.ts`, `src/lib/actions.ts`, `src/hooks/useBookmarks.tsx`, `src/components/bookmarks/BookmarkSearchBar.tsx`, `src/components/bookmarks/BookmarkGrid.tsx`, `docs/BOOKMARK_SEARCH_ARCHITECTURE.md`, `supabase/schema.sql`
- Dependencies: Supabase RLS, server-only `CORTEX_API_URL`, server-only `CORTEX_INTERNAL_API_KEY`, `bookmarks.cortex_status`, Cortex `/ingest`, `/search`, and delete cleanup
- Status: Active

## Canvas

- Feature: Infinite canvas
- Description: Desktop-first visual workspace for notes, media, links, embeds, sections, drag-resize interactions, and sidebar-only app navigation. Canvas notes, sections, uploads, section wrapping, and note membership updates are scoped to the active workspace.
- Key Files: `src/app/(dashboard)/canvas/page.tsx`, `src/components/canvas/*`, `src/hooks/useNotes.tsx`, `src/lib/canvas-actions.ts`, `src/lib/canvas-data.ts`, `src/lib/social-embeds.ts`, `supabase/schema.sql`
- Dependencies: Supabase auth, storage, signed URLs, route-level loading UI
- Status: Active

## Mobile Capture

- Feature: Mobile URL capture
- Description: Constrained mobile experience that lets authenticated users submit URLs into the active workspace without opening the full desktop workspace.
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
- Description: Nested bookmark organization with inbox, breadcrumbs, move, rename, and delete flows. Folder tree loading, duplicate checks, parent validation, folder pages, reparenting, and bookmark moves are active-workspace scoped and cannot cross workspaces.
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
- Description: Prototype-faithful first-run flow that demonstrates Nyabag by asking users to save one real bookmark into the active/default workspace through the normal bookmark pipeline, animating idle/website-skeleton creating/success states, polling real preview status, waiting for the normal top-viewport `screenshot_url` before success, and offering retry/skip/open actions into the dashboard.
- Key Files: `src/app/onboarding/page.tsx`, `src/components/onboarding/*`, `src/lib/onboarding.ts`, `src/lib/onboarding-actions.ts`, `src/lib/actions.ts`
- Dependencies: Supabase auth, onboarding table/state, bookmark creation pipeline, bookmark preview processing status, retry bookmark processing action, favicon route
- Status: Active

## Authentication

- Feature: Public sign-in and signup
- Description: Responsive split-panel auth experience aligned with onboarding and Nyabag's design system. Both routes use Supabase email/password auth, preserve safe encoded `next` handoffs for dashboard and Chrome-extension flows, expose password visibility controls, and distinguish signup email-confirmation success from errors.
- Key Files: `src/app/login/page.tsx`, `src/app/signup/page.tsx`, `src/components/auth/AuthShell.tsx`, `src/app/globals.css`, `src/lib/security/redirect-safety.ts`
- Dependencies: Supabase auth, public logo/auth visual assets, shared Button/Input/Field/Alert/HugeIcon primitives
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
- Description: API routes that support browser-extension password auth, web-session handoff auth, refresh, user profile lookup, workspace/collection lookup, unified bookmark/screenshot capture through `/captures`, upload, and commit flows. Capture endpoints may accept optional `workspaceId`, validate membership server-side, and fall back safely to the user's default workspace. Sessions are API-origin-bound and validated through `/me`, and bearer-auth failures expose stable safe diagnostic codes.
- Key Files: `src/app/api/extension/*`, `src/lib/extension/*`, `supabase/schema.sql`
- Dependencies: Supabase auth, service-role-only one-time auth code storage, `NYABAG_CHROME_EXTENSION_IDS`, CORS rules, capture storage, extension client state
- Status: Active

## Captures

- Feature: Screenshot captures gallery and lightbox
- Description: Masonry screenshot gallery with a body-portaled full-viewport lightbox, fit-to-screen display, zoom and drag panning, keyboard navigation, metadata, source actions, and deletion. Capture rows are stored with `workspace_id`; storage paths remain user-based.
- Key Files: `src/components/captures/CapturesPageClient.tsx`, `src/app/(dashboard)/captures/page.tsx`, `src/app/globals.css`, `src/app/api/captures/[id]/route.ts`
- Dependencies: Authenticated dashboard shell, `captures` table, private capture storage signed URLs
- Status: Active

## Future Features

- Browser Extension
- Figma Integration
- Cortex search observability and stale-ID cleanup tools
- More robust processor observability

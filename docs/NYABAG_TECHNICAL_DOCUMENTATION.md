# Nyabag Technical Documentation

Last updated: 2026-07-13

Nyabag is a desktop-first bookmark and notes workspace built with Next.js, Supabase, and React. It combines personal workspaces, a visual bookmark moodboard, and a FigJam-style infinite canvas for notes, links, media, social embeds, and grouped sections. This repo is now app-only for `app.nyabag.com`: the authenticated product lives at `/`, while marketing/editorial pages have been removed. This document is intended for future developers working on the codebase, deployment, debugging, and feature expansion.

For agent workflows, start with `AGENTS.md` and `.ai-memory/README.md`. The `.ai-memory/` layer is the short-form working memory for coding agents, while this document remains the canonical architecture source. Bookmark search details live in `docs/BOOKMARK_SEARCH_ARCHITECTURE.md`.

## Table of Contents

1. [Product Overview](#product-overview)
2. [Feature Inventory](#feature-inventory)
3. [Tech Stack](#tech-stack)
4. [Repository Structure](#repository-structure)
5. [Routing and Layout](#routing-and-layout)
6. [Supabase Data Model](#supabase-data-model)
7. [Authentication and Security Model](#authentication-and-security-model)
8. [Bookmark System](#bookmark-system)
9. [Notes Canvas System](#notes-canvas-system)
10. [Mobile URL Capture](#mobile-url-capture)
11. [Profile System](#profile-system)
12. [Important Functions by Module](#important-functions-by-module)
13. [Client State and Sync Patterns](#client-state-and-sync-patterns)
14. [External Integrations](#external-integrations)
15. [Environment and Deployment Notes](#environment-and-deployment-notes)
16. [Build, Lint, and Quality Status](#build-lint-and-quality-status)
17. [Known Issues](#known-issues)
18. [Fixed Issues and Changelog Notes](#fixed-issues-and-changelog-notes)
19. [Suggested Future Improvements](#suggested-future-improvements)

## Product Overview

Nyabag helps users collect websites and visual references, then organize ideas on a canvas. The product has one main content boundary plus two primary surfaces:

- **Workspaces**: first-party personal containers that scope saved content. V1 supports same-user create, switch, and rename only.
- **Bookmarks**: a clean visual moodboard of saved websites, with screenshots, extracted palettes, tags, summaries, detected fonts, and detail pages.
- **Notes**: an infinite canvas inspired by FigJam/Figma, supporting draggable and resizable notes, media notes, social embeds, and grouped sections.

The app is currently desktop-first. Mobile authenticated users see a small capture-only interface where they can submit URLs as real bookmarks, then continue working on desktop.

## Feature Inventory

### Workspaces

- Active content boundary for bookmarks, folders, canvas notes/sections, captures, onboarding preview state, Cortex records, and Oracle processing jobs.
- Existing `user_id` columns remain owner/creator metadata; `workspace_id` is the scoping container.
- Active workspace is resolved server-side from the `nyabag-active-workspace-id` cookie after validating `workspace_members`.
- Fallback order is valid cookie workspace, newest membership workspace, then auto-created `Personal`.
- Sidebar switcher supports create, switch, and rename.
- V1 intentionally has no workspace delete UI, invites, billing, sharing, or real-time collaboration.

### Bookmarks

- Add, edit, and delete bookmarks.
- First-run onboarding asks users to save one real bookmark so the core product loop is visible before setup work.
- Moodboard-style bookmark grid.
- Cortex-backed active bookmark search. Hosted Cortex validates the internal token, scopes search by user, evidence-gates specific visual queries, and returns `nyabagBookmarkId` values; Nyabag owner-filters those IDs through Supabase before returning cards.
- Bookmark queries and mutations also filter by active `workspace_id`.
- Empty search still uses the normal local bookmark list with tag and recent filters.
- Tag filtering and recent filtering.
- Visual detail page for each bookmark.
- Dual website screenshots through Oracle processing: a normal top-viewport image for onboarding and a long full-page image for app previews.
- Palette extraction from stored screenshot data where available.
- Fallback palette/font generation based on domain.
- Metadata scraping for title, summary, and inferred tags.
- In-app delete confirmation flow in bookmark UI.
- Pending bookmark UI while new bookmark creation is in progress.

### Bookmark Detail Pages

- Dedicated route at `/bookmarks/[id]`.
- Large long-screenshot preview with normal screenshot fallback for older records and extension captures.
- Domain/title/URL metadata.
- Extracted colors shown in designer-friendly categories.
- Detected fonts.
- Tags, summary, and external visit action.

### Notes Canvas

- Route at `/canvas`.
- Infinite canvas with panning and zooming.
- Fixed-size dot background that remains visually stable at different zoom levels.
- Two-finger trackpad panning in all directions.
- Ctrl/pinch wheel zoom at pointer.
- Select mode and pan mode with keyboard shortcuts:
  - `V` selects default pointer mode.
  - `H` selects hand/pan mode.
- Native cursor behavior:
  - select mode uses default cursor.
  - pan mode uses native `grab` / `grabbing`.
- Note creation by clicking or drag-sizing on the canvas.
- Supported note types:
  - text
  - link
  - image
  - video
  - social
- Drag and resize notes.
- Multi-select with marquee selection.
- Delete selected notes.
- Bring notes to front.
- Color picker per note.
- Persistent sections with labels.
- Wrap selected notes into a new section.
- Move sections and their member notes together.
- Resize sections without resizing notes.
- Rename and delete sections.

### Media Notes

- Image and video notes support URL-based media and uploaded media.
- Media dialog opens before image/video note placement.
- Upload tab supports drag/drop and file picker.
- Link tab supports URL input.
- Uploaded files are stored in private Supabase Storage under `canvas-media`.
- Uploaded media is rendered through signed URLs.
- Image notes render uploaded or external images.
- Video notes render uploaded videos with controls.
- YouTube and Vimeo URLs render as embeds.

### Social Notes

- Social note type supports public post URLs from:
  - X / Twitter
  - Facebook
  - LinkedIn
- Social URLs are validated before being stored.
- X/Twitter uses publish/oEmbed/widget behavior.
- Facebook and LinkedIn embeds are best-effort because public embed behavior depends on provider restrictions.
- Unsupported/private/restricted posts fall back gracefully.

### Profile

- Profile route at `/profile`.
- Stores name, email, phone, and optional avatar.
- Avatar uploads go to Supabase Storage bucket `profile-avatars`.
- Avatar public URL is derived from the storage path.
- Telegram capture setup remains available from profile and is not required during onboarding.

### Onboarding

- Route at `/onboarding`.
- Authenticated first-run flow centered on saving one real bookmark through a three-step idle, creating, and success experience.
- Uses the same `createBookmark(formData)` action as the dashboard and mobile capture surfaces.
- Preserves a single persistent stage card that morphs between internal idle, loading, and saved-preview layers.
- Polls `getOnboardingBookmarkPreview(bookmarkId)` after creation and keeps the creating state active until the normal top-viewport `screenshot_url` exists; processor failures before that normal screenshot show retry/skip actions instead of a fake success state.
- Users can explicitly skip first bookmark creation, which calls `completeOnboarding()` and enters the dashboard.
- Does not require workspace type, primary goal, focus area, or Telegram connection.

### Authentication pages

- `/login` and `/signup` share a responsive split-panel presentation through `src/components/auth/AuthShell.tsx` while keeping their existing Supabase client auth behavior.
- Signup intentionally requests only email and password. Profile name, phone, and avatar fields have schema defaults and remain part of profile setup rather than account creation.
- Both pages preserve sanitized encoded `next` values when linking to each other and after successful authentication, including the Chrome-extension web-session start flow.
- Password reveal controls, loading feedback, accessible error alerts, and a separate email-confirmation success state provide the interactive feedback layer.
- Auth motion respects `prefers-reduced-motion`; visual styling uses shared Nyabag tokens and primitives.

### Mobile URL Capture

- Login/signup remain available on mobile.
- Authenticated mobile users do not see the full desktop dashboard.
- Mobile users see a compact message that Nyabag works best on desktop.
- Mobile users can submit a website URL.
- The mobile URL uses the same `createBookmark` server action as desktop bookmark creation, so metadata, tags, palette, and screenshot behavior are shared.

### Browser Extension API

- Existing extension password login and refresh endpoints return normal Supabase access/refresh sessions.
- Web-session login starts at `/api/extension/auth/start` with a Chrome identity `redirect_uri` and random `state`.
- `start` requires an authenticated Nyabag web session or redirects to `/login?next=<start-url>`.
- If the user is unauthenticated, the login/signup round-trip preserves that original `next` value so the browser-extension auth request resumes after web auth instead of landing in the normal dashboard flow.
- Authenticated starts create short-lived one-time exchange codes in `extension_auth_codes`; only code hashes are stored.
- `/api/extension/auth/exchange` validates the same redirect URI, consumes the code exactly once, mints a separate Supabase session for the extension, and returns the same token shape as password login.
- Existing extension `me`, `collections`, `capture`, `upload-url`, and `commit-screenshot` routes remain bearer-token compatible.
- `/api/extension/collections` returns workspace rows alongside the legacy collection shape.
- `/api/extension/captures` accepts optional `workspaceId`; if provided, the route uses it only when the authenticated user is a member. Otherwise it falls back to the user's default workspace or returns a safe workspace error.

## Tech Stack

| Area | Technology |
| --- | --- |
| Framework | Next.js 16.2.6 |
| React | React 19.2.4 |
| Language | TypeScript |
| Auth | Supabase Auth |
| Database | Supabase Postgres |
| Storage | Supabase Storage |
| Validation | Zod 4 |
| Icons | Hugeicons Stroke Rounded via `@hugeicons/react` and `@hugeicons/core-free-icons` |
| UI primitives | Radix Dialog primitives for some dialogs |
| Styling | Global CSS in `src/app/globals.css`, Tailwind tooling present |
| Typography | Hanken Grotesk headings and Inter body text through `next/font/google` |
| Metadata/screenshot | External Oracle bookmark processor plus app fallback metadata helpers |
| Deployment target | Vercel |

Important scripts:

```bash
npm run dev
npm run build
npm run start
npm run lint
```

`npm run dev` uses `next dev --webpack`.

## Repository Structure

```text
src/app/
  layout.tsx                         Root app layout and global CSS import
  api/extension/                     Browser extension auth, capture, upload, and commit route handlers
  login/page.tsx                     Login page
  signup/page.tsx                    Signup page
  onboarding/page.tsx                First-memory onboarding flow
  privacy/page.tsx                   Public legal support page
  terms/page.tsx                     Public legal support page
  (dashboard)/layout.tsx             Authenticated dashboard layout
  (dashboard)/page.tsx               Main bookmarks dashboard
  (dashboard)/canvas/page.tsx        Notes canvas page
  (dashboard)/bookmarks/[id]/page.tsx Bookmark detail route
  (dashboard)/captures/page.tsx      Captures route
  (dashboard)/folders/[folderId]/page.tsx Folder route
  (dashboard)/profile/page.tsx       Profile route

src/components/
  bookmarks/                         Bookmark cards, modals, detail UI
  canvas/                            Canvas board, toolbar, notes, sections, media/social content
  layout/                            Dashboard shell, navigation, sidebar, mobile capture
  profile/                           Profile form
  ui/                                Small UI primitives
  workspaces/                        Workspace switcher and create/rename dialogs

src/hooks/
  useBookmarks.tsx                   Bookmark client state and filtering
  useNotes.tsx                       Canvas client state and optimistic sync

src/lib/
  actions.ts                         Bookmark/profile/auth server actions
  canvas-actions.ts                  Canvas server actions
  canvas-data.ts                     Server data loading for canvas
  workspace-actions.ts               Workspace create, switch, and rename server actions
  workspaces.ts                      Active workspace resolver and membership helpers
  data.ts                            Bookmark design data, Microlink helpers, formatting
  metadata.ts                        Metadata scraper and tag inference
  profile.ts                         Profile loading and avatar URL helpers
  social-embeds.ts                   Social URL parsing and embed helpers
  supabase/                          Supabase clients
  types.ts                           Shared TypeScript types
  validations.ts                     Zod schemas

supabase/
  schema.sql                         Full rerunnable Supabase schema
```

## Routing and Layout

### Public/Auth Routes

- `/login`: email/password login UI.
- `/signup`: account creation UI.
- `/onboarding`: authenticated first-run flow that animates idle, creating, and success states while saving one real bookmark or lets the user explicitly skip into the dashboard.
- `/privacy`: public privacy policy.
- `/terms`: public terms of service.

### Authenticated Dashboard Routes

- `/`: bookmarks dashboard.
- `/bookmarks/[id]`: bookmark detail page.
- `/canvas`: notes canvas.
- `/captures`: captured references.
- `/folders/[folderId]`: folder-specific bookmark view.
- `/profile`: profile settings.

The dashboard is wrapped by `src/components/layout/DashboardShell.tsx`. Desktop app navigation lives in `DashboardSidebar`; the top Bookmarks/Canvas feature switch was removed so pages render directly inside a curved white main panel. The sidebar boundary uses viewport-fixed shell corner masks so the top and bottom curve remains visible while long dashboard pages scroll.

`src/app/(dashboard)/layout.tsx` resolves the active workspace after auth/onboarding checks, filters sidebar folder loading by that workspace, and passes `workspaces`, `activeWorkspace`, and `activeWorkspaceRole` into `DashboardShell`. The sidebar renders `WorkspaceSwitcher` instead of a hardcoded "Personal workspace" block.

Legacy `/app/*` URLs are compatibility redirects handled by `src/proxy.ts`; do not add duplicate `/app` routes.

`DashboardShell` responsibilities:

- Reads sidebar collapsed state from `localStorage`.
- Uses `useSyncExternalStore` to avoid hydration drift for sidebar/mobile state.
- Detects mobile width using a 768px breakpoint.
- Shows `MobileBookmarkCapture` on mobile.
- Shows sidebar and page children on desktop.

## Supabase Data Model

The complete schema lives in `supabase/schema.sql`. It is designed to be safe to rerun and uses `DROP POLICY IF EXISTS` / `CREATE POLICY` patterns to avoid duplicate policy errors.

### `workspaces`

Stores same-user personal workspace containers.

Important fields:

| Field | Purpose |
| --- | --- |
| `id` | Workspace UUID |
| `owner_id` | Creating/owning user |
| `name` | Display name |
| `slug` | Stable local slug for future routing/use |
| `icon` | Future icon metadata |
| `color` | Future color metadata |

### `workspace_members`

Maps users to workspaces.

Important fields:

| Field | Purpose |
| --- | --- |
| `workspace_id` | Referenced workspace |
| `user_id` | Member user |
| `role` | `owner`, `admin`, `member`, or `viewer` |

V1 only creates owner memberships in the UI. `ensure_personal_workspace(p_user_id uuid)` creates a default `Personal` workspace and owner membership when a user has no workspace rows.

### `bookmarks`

Stores saved website references.

Important fields:

| Field | Purpose |
| --- | --- |
| `id` | Bookmark UUID |
| `user_id` | Owner, references `auth.users(id)` |
| `workspace_id` | Content container, references `workspaces(id)` |
| `url` | Saved website URL |
| `title` | Display title |
| `tags` | User and inferred tags |
| `palette` | Extracted or fallback colors |
| `fonts` | Detected or fallback fonts |
| `screenshot_url` | Normal top-viewport screenshot URL used by onboarding and fallback display |
| `screenshot_refreshed_at` | Normal screenshot timestamp |
| `long_screenshot_url` | Long full-page screenshot URL preferred by dashboard, folder, detail, and Cortex ingest surfaces |
| `long_screenshot_refreshed_at` | Long screenshot timestamp |
| `summary` | Metadata description summary |
| `metadata_refreshed_at` | Metadata scrape timestamp |
| `note` | User note |
| `cortex_status` | Deferred Cortex ingest state, separate from legacy semantic status |
| `cortex_error` | Safe truncated Cortex ingest failure detail |
| `cortex_memory_id` | Cortex memory id returned after successful ingest |
| `cortex_ingested_at` | Successful Cortex ingest timestamp |

Important constraints:

- URL max length: 2048.
- Title max length: 255.
- Summary max length: 1000.
- Note max length: 2000.
- Cortex status must be `pending`, `processing`, `ready`, `failed`, or `skipped`.
- RLS restricts rows to `auth.uid() = user_id` and a valid `workspace_members` row for `workspace_id`.

### `profiles`

Stores user profile metadata.

Important fields:

- `user_id`
- `name`
- `email`
- `phone`
- `avatar_path`
- timestamps

RLS restricts profile access to the owner.

### `canvas_notes`

Stores persistent notes on the canvas.

Important fields:

| Field | Purpose |
| --- | --- |
| `id` | Note UUID |
| `user_id` | Owner |
| `workspace_id` | Content container |
| `section_id` | Optional section membership |
| `type` | `text`, `link`, `image`, `video`, or `social` |
| `content` | Text, link URL, video URL, or social-prefixed URL |
| `media_source` | `url`, `upload`, or null |
| `media_path` | Private Supabase Storage path |
| `media_mime` | Uploaded media MIME type |
| `media_name` | Uploaded original filename |
| `x`, `y` | Canvas position |
| `width`, `height` | Canvas size |
| `color` | Note background color |
| `z_index` | Render stacking order |

Important constraints:

- Note type check includes `social`.
- Media source must be null, `url`, or `upload`.
- Width min 100, height min 80 through application validation.
- RLS restricts rows to the owner and workspace membership.

### `canvas_sections`

Stores Figma-like sections.

Important fields:

- `id`
- `user_id`
- `workspace_id`
- `label`
- `x`, `y`
- `width`, `height`
- `color`
- `z_index`
- timestamps

Sections are owner/workspace-scoped with RLS. Deleting a section should ungroup notes rather than delete them.

### `bookmark_folders`

Stores nested folder organization for bookmarks. Folder rows include `workspace_id`; sibling duplicate checks, parent validation, folder pages, reparenting, and bookmark moves are all limited to one workspace.

### `captures`

Stores extension/gallery screenshot captures. `captures` is defined in the canonical schema rather than only in a migration file. Rows include `workspace_id`, while storage paths remain user-based.

### Storage Buckets

| Bucket | Purpose | Visibility |
| --- | --- | --- |
| `canvas-media` | Uploaded image/video note files | Private, signed URL access |
| `captures` | Extension screenshot captures | Private, signed URL access |
| `profile-avatars` | User avatars | Public URL access |

`canvas-media` paths are structured under the user and note:

```text
{user_id}/{note_id}/{uuid}-{safe_filename}
```

The schema includes storage policies so users can only read/write their own object paths.

### `extension_auth_codes`

Stores short-lived browser-extension web-session handoff codes.

Important fields:

| Field | Purpose |
| --- | --- |
| `code_hash` | SHA-256 hash of the random exchange code; the raw code is never stored |
| `user_id` | Authenticated Nyabag user that initiated the flow |
| `email` | User email used to mint the extension Supabase session |
| `redirect_uri` | Exact allowlisted Chrome identity callback URL |
| `state` | Extension-provided CSRF/state value |
| `expires_at` | Five-minute expiry boundary |
| `consumed_at` | Set atomically when `/api/extension/auth/exchange` consumes the code |

RLS is enabled with no user-facing policies. Server route handlers use the service-role client for insert and atomic consume operations.

## Authentication and Security Model

Security is enforced at several layers:

1. **Route/layout layer**
   - Dashboard routes require Supabase session access through server-side clients.
   - Dashboard layout resolves the active workspace server-side before loading workspace-scoped data.
   - Mobile users are gated to URL capture after authentication.

2. **Server action layer**
   - Every mutation calls `supabase.auth.getUser()`.
   - Mutations return `{ success: false, error: "Not authenticated" }` when no user exists.
   - Workspace-scoped updates/deletes include `.eq("user_id", user.id)` and `.eq("workspace_id", activeWorkspaceId)`.

3. **RLS layer**
   - Tables use row-level security.
   - Workspace-scoped policies check `auth.uid() = user_id` and valid membership for `workspace_id`.

4. **Storage layer**
   - Canvas media is private.
   - Signed URLs are generated server-side.
   - Media upload validates owner, note type, file MIME type, and file size.

5. **Validation layer**
   - Zod schemas validate bookmarks, profile updates, notes, sections, positions, sizes, and deletes.
   - Social notes validate supported social URL formats.
   - Media URLs are normalized and rejected if invalid.

6. **Extension web-session auth layer**
   - `NYABAG_CHROME_EXTENSION_IDS` pins allowed Chrome identity redirect hosts.
   - `/api/extension/auth/start` validates redirect URI and state before reading the web session.
   - One-time exchange codes are short-lived, user-scoped, hashed at rest, and consumed with a single conditional update.
   - `/api/extension/auth/exchange` returns normal Supabase tokens; extension APIs continue to verify them with `Authorization: Bearer <access_token>`.
   - Extension capture endpoints may accept optional `workspaceId`, but service-role handlers must validate membership before using it.

## Bookmark System

### Bookmark Creation Flow

Main action: `createBookmark(formData)` in `src/lib/actions.ts`.

Used by:
- Dashboard bookmark creation.
- Mobile URL capture.
- First-memory onboarding.

Performance lifecycle:
- `createBookmark(formData)` inserts a basic bookmark row immediately and returns it with `processing_status = "queued"`.
- A `bookmark_processing_jobs` row is created for the same bookmark.
- Oracle polls and claims `bookmark_processing_jobs` from Supabase; the app no longer dispatches GitHub Actions or ships a local processor worker.
- Oracle writes one normal top-viewport screenshot plus one long full-page screenshot to Supabase Storage, then updates the bookmark row.
- The normal screenshot is written first so onboarding can complete; completed long-screenshot enrichment marks the row `ready`. Failures mark it `failed` with `processing_error` while keeping any already-written normal screenshot usable.
- Cortex ingest is deferred until the row is `ready` and either `long_screenshot_url` or `screenshot_url` exists. The dashboard calls `ingestReadyBookmarksToCortex()` in throttled batches and tracks progress in `bookmarks.cortex_status`.
- The dashboard uses bounded polling for queued/processing bookmarks instead of storing private bookmark data in LocalStorage.

Flow:

1. Create Supabase server client.
2. Resolve authenticated user.
3. Resolve active workspace with `getWorkspaceContext(...)`.
4. Validate form data with `bookmarkCreateSchema`.
5. Normalize/parse URL.
6. Validate any target folder belongs to the active workspace.
7. Choose fallback title:
   - explicit user title
   - formatted domain
   - raw URL fallback
8. Resolve design data from known domain database or deterministic fallback.
9. Insert bookmark row with `processing_status = "queued"` and `workspace_id`.
10. Enqueue `bookmark_processing_jobs` with `workspace_id`.
11. Return immediately; Oracle polls and processes the queued job.
12. Revalidate `/`.

### Bookmark Update Flow

Main action: `updateBookmark(formData)`.

Flow:

1. Validate input with `bookmarkUpdateSchema`.
2. Resolve active workspace.
3. Fetch existing bookmark metadata by bookmark id, user id, and workspace id.
3. If URL changed, clear stale normal and long preview fields and set `processing_status = "queued"`.
4. If URL did not change, preserve screenshots, palette, fonts, and summary where possible.
5. Validate any target folder belongs to the same workspace.
6. Update the owner/workspace-scoped row.
7. If URL changed, enqueue a new processing job for Oracle with the same workspace.
7. Revalidate `/`.

### Bookmark Delete Flow

Main action: `deleteBookmark(id)`.

Flow:

1. Resolve authenticated user.
2. Resolve active workspace.
2. Read screenshot paths and `cortex_memory_id` for cleanup.
3. Delete bookmark by `id`, `user_id`, and `workspace_id`.
4. If no rows were affected, distinguish between not found and wrong owner where possible.
5. Revalidate `/`.
6. Best-effort call Cortex to delete matching Neon memory and embedding rows by bookmark id plus user id and workspace id.
7. Remove stored normal and long screenshots.

The client currently performs optimistic delete in `useBookmarks`, then rolls back on failure.

### Metadata Scraping

Module: `src/lib/metadata.ts`.

`scrapeBookmarkMetadata(url)`:

- Fetches HTML with a 6 second abort timeout.
- Requires `text/html` response.
- Reads up to 250 KB of HTML.
- Extracts:
  - `og:title`, `twitter:title`, or `<title>`.
  - `description`, `og:description`, or `twitter:description`.
  - `keywords` / `news_keywords`.
  - JSON-LD text for classification signals.
- Applies category rules to infer tags like `ecommerce`, `design`, `development`, `ai`, `finance`, `social`, `video`, etc.

`mergeTags(userTags, inferredTags)`:

- Normalizes tags to lowercase slug-like strings.
- Deduplicates.
- Limits to 20 tags.

### Screenshot and Palette Retrieval

Module: `src/lib/data.ts`.

Current bookmark previews are generated by Oracle:

- Uses browser screenshot capture with a default desktop viewport.
- Captures a normal top-viewport screenshot, compresses it to WebP capped by `MAX_WEBP_HEIGHT=900`, uploads it to the public `bookmark-screenshots` storage bucket, and stores it in `bookmarks.screenshot_url`.
- Captures a long full-page screenshot, compresses it to WebP capped by `LONG_SCREENSHOT_MAX_WEBP_HEIGHT=4000`, uploads it to the same bucket, and stores it in `bookmarks.long_screenshot_url`.
- Dashboard cards, folder cards, bookmark detail, and Cortex ingest prefer `long_screenshot_url` and fall back to `screenshot_url`.
- Onboarding intentionally waits for and displays only `screenshot_url`, so users see the normal 16:9/top-viewport preview during first-run completion.

`getMicrolinkPreviewData(url)` remains a legacy helper in `src/lib/data.ts` for Microlink screenshot/palette fetches, but Oracle is the current screenshot path for newly saved bookmarks.

`SCREENSHOT_REFRESH_INTERVAL_MS`:

- Currently one week.
- Used to determine screenshot staleness.

`getDesignData(url)`:

- Uses `DESIGN_DB` for known domains.
- Falls back to deterministic palettes/fonts based on domain character codes.

## Notes Canvas System

### Main Components

| Component | Responsibility |
| --- | --- |
| `CanvasBoard` | Loads providers and canvas surface |
| `CanvasContainer` | Canvas viewport, pan, zoom, selection, placement, context menu |
| `CanvasToolbar` | Tool selection, note type buttons, media dialog trigger |
| `CanvasStatusBar` | Zoom controls/status |
| `CanvasNote` | Single note wrapper, drag behavior, selected state |
| `ResizeHandles` | Note resize handles |
| `NoteContent` | Type switch for note body |
| `NoteTextContent` | Text editing and blur-save |
| `NoteLinkContent` | Link input and preview |
| `NoteImageContent` | Image URL/upload rendering and edit controls |
| `NoteVideoContent` | Video URL/upload rendering and edit controls |
| `NoteSocialContent` | Social post URL input and embed rendering |
| `CanvasSection` | Persistent section rendering, moving, resizing, renaming |
| `MediaNoteDialog` | Image/video upload/link dialog before placement |

### Canvas State

Main hook: `useNotes` in `src/hooks/useNotes.tsx`.

Performance notes:
- Initial canvas loading uses explicit render columns for notes and sections instead of `select("*")`.
- Uploaded media signed URLs are created with one `createSignedUrls(..., 3600)` batch call and mapped back to notes.
- `src/features/canvas/store/useCanvasStore.ts` keeps normalized notes/sections plus isolated viewport, selection, and tool state for selector-based rendering.
- Canvas viewport is the only canvas state persisted to LocalStorage; private notes/media are not stored there.
- TODO for large canvases: load notes inside or near the current viewport rather than all notes.

Primary state:

- `notes`
- `sections`
- `toolMode`: `select` or `pan`
- `activeNoteTool`
- `pendingMediaNote`
- `isCreatingMediaNote`
- `mediaPlacementError`
- `viewport`: `{ x, y, scale }`
- `selectedIds`

Important behavior:

- Text/link/social tools activate placement immediately.
- Image/video tools open `MediaNoteDialog` first.
- Once media is selected, `pendingMediaNote` is stored and placement mode is armed.
- Notes can be click-created at default size or drag-created at custom size.
- Delete actions refresh from an authoritative server snapshot to avoid stale client notes.

### Canvas Pan and Zoom

Implemented in `CanvasContainer`.

- Pointer drag pans when:
  - middle mouse button is used,
  - space is held,
  - pan mode is active.
- Trackpad two-finger `wheel` without Ctrl pans the canvas in both axes.
- `wheel` with Ctrl/pinch zooms at the pointer.
- Zoom is clamped between `MIN_SCALE = 0.1` and `MAX_SCALE = 4.0`.
- Background dots are screen-space fixed at `24px 24px`.
- Background position follows viewport offset modulo 24px.

### Cursor Behavior

CSS in `src/app/globals.css`:

- Select mode uses native `default`.
- Pan mode uses native `grab`.
- Active panning uses native `grabbing`.
- Cursor is inherited across note/section surfaces to avoid flicker across nested elements.
- Controls and resize handles explicitly keep their expected cursors.

### Note Creation

Regular note action: `createNote(type, x, y, color, width?, height?)`.

Behavior:

- Authenticates user.
- Computes next `z_index`.
- Applies defaults:
  - most notes: `240x180`
  - social notes: `420x520`
- Validates with `noteCreateSchema`.
- Inserts owner-scoped row.
- Revalidates `/canvas`.

Note type detail:

- Social notes are intended to be represented with social content using `SOCIAL_NOTE_PREFIX`.
- The current implementation has special social handling in server and client code; verify stored `type` behavior if extending this area.

### Media Note Creation

New media-first flow:

1. User selects Image or Video tool.
2. `MediaNoteDialog` opens.
3. User chooses:
   - local file through drag/drop or file picker, or
   - URL through link input.
4. Dialog validates basic client-side constraints.
5. Canvas arms placement with `pendingMediaNote`.
6. User clicks or drags on canvas.
7. Server creates the note and attaches media.

Server actions:

- `createMediaNoteFromUrl(type, url, x, y, color, width?, height?)`
- `createMediaNoteWithUpload(type, formData, x, y, color, width?, height?)`

Upload limits:

- Images: 10 MB.
- Videos: 50 MB.

Upload behavior:

- Creates note row.
- Uploads file to `canvas-media`.
- Updates note with `media_source`, `media_path`, `media_mime`, `media_name`.
- Generates signed URL before returning.
- Rolls back note/storage if upload or attach fails.

### Existing Media Editing

Image/video notes still include body-level Change/Clear controls:

- `uploadNoteMedia(id, formData)` replaces uploaded media on an existing note.
- `updateNoteContent(id, content, color?, "url")` stores external media URL.
- `removeNoteMedia(id)` clears media fields and removes stored upload.

### Social Embeds

Module: `src/lib/social-embeds.ts`.

Important helpers:

- `SOCIAL_NOTE_PREFIX`
- `isSocialNoteContent(content)`
- `getSocialNoteUrl(content)`
- `toSocialNoteContent(url)`
- `parseSocialEmbed(raw)`
- `socialProviderLabel(provider)`

Supported formats:

- `x.com/.../status/...`
- `twitter.com/.../status/...`
- Facebook public post/permalink/photo/video/story URLs.
- LinkedIn posts and feed update URLs.

Provider caveats:

- X/Twitter embed rendering depends on platform widgets.
- Facebook public embeds depend on post visibility and platform restrictions.
- LinkedIn embed URLs are generated when an activity/share/UGC id can be parsed; otherwise fallback UI is used.

### Sections

Server actions:

- `createSectionFromNotes(label, noteIds)`
- `updateSectionLabel(id, label)`
- `updateSectionPosition(id, x, y, notes)`
- `updateSectionSize(id, width, height)`
- `deleteSection(id)`

Client behavior:

- Drag-select notes.
- Right-click selected notes.
- Choose "Wrap in new section".
- Enter label.
- Server creates section bounds using selected note positions with padding.
- Notes receive `section_id`.
- Moving a section moves member notes by delta.
- Deleting a section removes section and unsets member note `section_id`.

## Mobile URL Capture

Component: `src/components/layout/MobileBookmarkCapture.tsx`.

Flow:

1. Authenticated user opens app on mobile width.
2. `DashboardShell` renders mobile capture instead of desktop UI.
3. User submits a URL.
4. The component calls `createBookmark(formData)`.
5. On success, the bookmark is immediately available on desktop.

No separate pending mobile table exists. Mobile capture creates real bookmarks immediately.

## Profile System

Modules:

- `src/lib/profile.ts`
- `src/lib/actions.ts`
- `src/components/profile/ProfileForm.tsx`

`getUserProfile(supabase, user)`:

- Fetches profile row by `user_id`.
- Adds `avatar_url` from `profile-avatars` public URL if `avatar_path` exists.
- Returns a fallback profile object when no row exists.

`updateProfile(formData)`:

- Validates text fields with `profileUpdateSchema`.
- Validates avatar MIME and size.
- Uploads new avatar to `profile-avatars`.
- Removes old avatar when replaced.
- Upserts profile row.
- Revalidates `/profile`, `/`, and `/canvas`.

## Important Functions by Module

### `src/lib/extension/web-session-auth.ts`

| Function | Purpose |
| --- | --- |
| `validateChromeIdentityRedirectUri(...)` | Accept only `https://<allowed-id>.chromiumapp.org/nyabag-auth` redirects from `NYABAG_CHROME_EXTENSION_IDS` |
| `validateExtensionAuthState(...)` | Validate bounded URL-safe state values |
| `createExtensionExchangeCode(...)` | Generate and store a hashed five-minute one-time code for the authenticated user |
| `consumeExtensionExchangeCode(...)` | Atomically consume a matching unexpired code exactly once |
| `createExtensionSessionForConsumedCode(...)` | Mint and verify a separate Supabase session for the extension |

### `src/lib/workspaces.ts` and `src/lib/workspace-actions.ts`

| Function | Purpose |
| --- | --- |
| `getWorkspaceContext(...)` | Resolve active workspace from cookie, membership rows, and Personal fallback |
| `resolveWorkspaceForUser(...)` | Service-route helper for optional workspace ids from extension/API payloads |
| `setActiveWorkspace(id)` | Validate membership, set active workspace cookie, and revalidate app routes |
| `createWorkspace(formData)` | Create workspace plus owner membership and make it active |
| `renameWorkspace(formData)` | Rename an owned/manageable workspace |

### `src/lib/actions.ts`

| Function | Purpose | Side effects |
| --- | --- | --- |
| `createBookmark(formData)` | Create active-workspace bookmark and enqueue metadata/screenshot enrichment | Inserts `bookmarks`, enqueues Oracle work, revalidates `/` |
| `updateBookmark(formData)` | Update active-workspace bookmark and refresh metadata if URL changes | Updates `bookmarks`, revalidates `/` |
| `deleteBookmark(id)` | Delete active-workspace bookmark | Deletes `bookmarks`, revalidates `/`, cleans storage/Cortex best-effort |
| `updateProfile(formData)` | Upsert profile and optional avatar | Uploads/removes avatar, upserts `profiles`, revalidates routes |
| `signOut()` | End Supabase session | Calls Supabase sign out, revalidates `/` |

### `src/lib/onboarding-actions.ts`

| Function | Purpose | Side effects |
| --- | --- | --- |
| `completeOnboarding()` | Mark first-run onboarding complete | Upserts `user_onboarding`, revalidates onboarding/dashboard/profile routes |
| `getOnboardingBookmarkPreview(bookmarkId)` | Fetch the authenticated user's newly created bookmark preview fields for onboarding polling | Read-only owner-scoped bookmark lookup |

### `src/lib/canvas-actions.ts`

| Function | Purpose | Side effects |
| --- | --- | --- |
| `createNote(...)` | Create text/link/image/video/social note row | Inserts `canvas_notes`, revalidates `/canvas` |
| `createMediaNoteFromUrl(...)` | Create image/video note from URL | Inserts `canvas_notes`, revalidates `/canvas` |
| `createMediaNoteWithUpload(...)` | Create image/video note with uploaded file | Inserts row, uploads storage object, updates row, signed URL, rollback on failure |
| `updateNoteContent(...)` | Update note content/color/media URL | Updates row, removes old stored media when switching source |
| `uploadNoteMedia(...)` | Attach or replace upload on existing image/video note | Uploads storage object, updates row, removes old upload |
| `removeNoteMedia(id)` | Clear media from note | Updates row, removes stored upload |
| `updateNotePosition(...)` | Persist note position | Updates `x`, `y` |
| `updateNoteSize(...)` | Persist note dimensions | Updates `width`, `height` |
| `bringNoteToFront(id)` | Persist note z-index | Updates `z_index` |
| `deleteNote(id)` / `deleteNotes(ids)` | Delete notes and return changed IDs by default | Deletes notes/storage and only returns a snapshot when requested |
| `createSectionFromNotes(...)` | Create section around selected notes | Inserts `canvas_sections`, updates note `section_id` |
| `updateSectionPosition(...)` | Move section and member notes | Updates section and notes |
| `updateSectionSize(...)` | Resize section | Updates section |
| `updateSectionLabel(...)` | Rename section | Updates section |
| `deleteSection(id)` | Ungroup and delete section | Sets member note `section_id` null, deletes section |

### `src/lib/data.ts`

| Function | Purpose |
| --- | --- |
| `getDomain(url)` | Extract hostname without `www.` |
| `getDesignData(url)` | Known/fallback palette and font data |
| `getMicrolinkPreviewData(url)` | Fetch screenshot and palette from Microlink |
| `getScreenshotPalette(url)` | Convenience palette helper |
| `isScreenshotStale(refreshedAt)` | One-week screenshot staleness check |
| `getTagColor(tag)` | Deterministic tag color |
| `getFaviconUrl(url)` | Google favicon service URL |
| `getScreenshotUrl(url)` | Microlink screenshot embed URL |
| `formatDate(dateStr)` | UI date formatter |

### `src/lib/metadata.ts`

| Function | Purpose |
| --- | --- |
| `scrapeBookmarkMetadata(url)` | Fetch HTML and infer title, summary, tags |
| `mergeTags(userTags, inferredTags)` | Normalize, dedupe, and cap tags |

### `src/hooks/useBookmarks.tsx`

| State/Function | Purpose |
| --- | --- |
| `bookmarks` | Current bookmark list |
| `pendingBookmarks` | Client-only pending creation cards |
| `activeTag`, `activeFilter`, `search` | Filtering inputs |
| `searchState` | Discriminated server-search state; active searches render only ranked server results |
| `addOpen`, `editTarget`, `detailTarget` | Modal state |
| `deleteItem(id)` | Optimistic delete with rollback |
| `filtered` | Derived filtered bookmark list |

### `src/hooks/useNotes.tsx`

| State/Function | Purpose |
| --- | --- |
| `notes`, `sections` | Canvas data |
| `toolMode` | Select/pan mode |
| `activeNoteTool` | Current note creation tool |
| `pendingMediaNote` | Media selected before image/video placement |
| `viewport` | Pan/zoom state |
| `selectedIds` | Multi-selection state |
| `addNote` / `addMediaNote` | Create notes |
| `updateContent` | Optimistic content/color/media URL update |
| `uploadMedia` / `removeMedia` | Existing note media mutation |
| `setNotePosition` / `commitPosition` | Local move and server persistence |
| `setNoteSize` / `commitSize` | Local resize and server persistence |
| `wrapSelectionInSection` | Section creation flow |
| `deleteNotes` | Optimistic delete followed by server snapshot sync |

## Client State and Sync Patterns

Nyabag uses a mix of optimistic UI and server-confirmed updates.

### Bookmarks

- Bookmark creation uses pending UI while asynchronous Oracle work produces metadata and the stored screenshot.
- Delete is optimistic in `useBookmarks`.
- On delete failure, previous bookmark state is restored.

### Canvas

- Content updates are optimistic, then replaced with server result.
- Failed content updates roll back to the previous note.
- Delete uses an authoritative server snapshot to remove stale IDs.
- Section wrapping filters stale selected IDs before server mutation.
- Media note creation is not rendered until the server successfully creates the media-backed note.

## External Integrations

### Supabase

Used for:

- Auth sessions.
- Postgres tables.
- Storage buckets.
- RLS policies.

Expected environment variables are typically:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Confirm exact names in `src/lib/supabase/server.ts` and `src/lib/supabase/client.ts` before deployment.

Extension web-session auth also requires the server-only allowlist:

```text
NYABAG_CHROME_EXTENSION_IDS
```

Never prefix this allowlist or `SUPABASE_SERVICE_ROLE_KEY` with `NEXT_PUBLIC_`.

### Bookmark Processor

Used for current bookmark previews:

- Normal top-viewport Playwright screenshots for onboarding.
- Long full-page Playwright screenshots for app previews and Cortex ingest.
- Screenshot-derived color palettes.

Important operational note:

- Oracle polls the Supabase job queue and owns retry/ready/failed transitions.
- Nyabag stores normal and long screenshot URLs plus refreshed timestamps so screenshots do not need to be regenerated on every login.

### Cortex Engine

Hosted Cortex is the external active bookmark search backend. Nyabag keeps Cortex separate from this repo and only calls it from server-side code.

- `src/lib/cortex.ts` reads server-only `CORTEX_API_URL` and `CORTEX_INTERNAL_API_KEY`.
- `src/lib/cortex-actions.ts` posts `nyabagBookmarkId`, `userId`, `workspaceId`, `url`, `title`, `summary`, and a non-null screenshot URL to Cortex `/ingest` only after bookmark processing is ready.
- `deleteBookmark(id)` best-effort calls Cortex `DELETE /memories/bookmark/{nyabagBookmarkId}` with `CORTEX_INTERNAL_API_KEY` after the Supabase row is deleted, so stale Neon rows do not consume search result slots.
- `bookmarks.cortex_status`, `cortex_error`, `cortex_memory_id`, and `cortex_ingested_at` track deferred ingest separately from legacy semantic search columns.
- Active bookmark search calls internal-token-authenticated Cortex `/search` with `userId` and `workspaceId` and uses returned `nyabagBookmarkId` values as the authoritative ranking source.
- Cortex filters by `userId` before ranking; returned Cortex IDs are also filtered through active-workspace Supabase queries and then reordered to Cortex order.
- If Cortex is missing or unavailable, bookmark creation still works and active search shows a Cortex-unavailable state instead of falling back to the retired local/Gemini search stack.
- Nyabag no longer runs app-side Gemini bookmark enrichment. The retired `bookmark_ai_metadata`, `bookmark_visual_facts`, and bookmark `ai_*` fields are removed by migration; Cortex owns AI memory/search.
- Legacy Supabase search objects such as lexical RPCs, embedding tables, vector indexes, and semantic status columns may remain until a future explicit cleanup migration.

### Provider Embeds

Used for social notes and videos:

- YouTube iframe embeds.
- Vimeo iframe embeds.
- X/Twitter widgets/oEmbed.
- Facebook embed SDK.
- LinkedIn embed iframe where parseable.

CSP is configured in `next.config.ts`; update it when adding new media/embed providers.

## Environment and Deployment Notes

### Local Development

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

### Supabase Setup

1. Create Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Confirm buckets/policies exist:
   - `canvas-media`
   - `profile-avatars`
4. Add Supabase environment variables to `.env.local`.
5. Add `NYABAG_CHROME_EXTENSION_IDS=<chrome-extension-id>` for browser-extension web-session login.
6. If `NYABAG_CHROME_EXTENSION_IDS` is missing in production, `/api/extension/auth/start` fails closed with a 500 diagnostic naming that env var.
7. Add `CORTEX_API_URL=https://your-cortex-render-url.onrender.com` and `CORTEX_INTERNAL_API_KEY` for server-to-server Cortex search and delete cleanup.
8. Restart the dev server.

### Vercel Deployment

1. Push repo to GitHub.
2. Import project in Vercel.
3. Add Supabase environment variables.
4. Deploy.
5. Confirm Supabase auth redirect settings include the deployed domain.
6. Configure `NYABAG_CHROME_EXTENSION_IDS` with the production Chrome extension id.
7. Keep the local `.env.local` and deployment env aligned so the extension auth allowlist matches the installed extension id.

## Build, Lint, and Quality Status

Current observed status:

- `npm run build` passes.
- `npm run lint` passes with warnings.

Current lint warnings:

- Several UI files use raw `<img>` tags, triggering Next.js image optimization warnings.
- Some bookmark, folder, layout, and extension files have unused variables or missing image alt text.

## Known Issues

1. **Lint warnings in legacy UI and extension files**
   - Files include bookmark, folder, layout, capture, auth, canvas, and extension surfaces.
   - Cause: raw `<img>` usage, missing image alt text, and unused imports/variables.
   - Impact: `npm run lint` currently exits successfully, but warnings should be cleaned up over time.

2. **Raw `<img>` warnings**
   - Several components use `<img>` directly.
   - Impact: lint warnings only.
   - Reasonable for external, dynamic, or signed media, but should be reviewed case-by-case.

3. **Oracle processing dependency**
   - Screenshot and palette extraction depend on Oracle, Supabase Storage, and external site availability.
   - Nyabag stores normal and long screenshot URLs/refreshed timestamps, but new bookmarks and changed URLs still need a successful processor run.

4. **Social embeds are provider-dependent**
   - Private, deleted, region-restricted, or unsupported posts may fail.
   - LinkedIn public embedding is inconsistent.

5. **External media URLs may fail at render time**
   - Some domains block hotlinking or require CORS/anti-bot checks.
   - Uploaded media is more reliable because it uses Supabase Storage.

6. **Schema cache after Supabase changes**
   - Supabase/PostgREST may need a short refresh after schema updates before new columns are recognized.

## Fixed Issues and Changelog Notes

### Supabase schema rerun safety

- Policies now use `DROP POLICY IF EXISTS` before recreation.
- This fixed duplicate-policy errors such as `policy "select_own_bookmarks" already exists`.

### Canvas social note schema support

- `canvas_notes.type` validation includes `social`.
- This fixed check constraint failures when creating social notes.

### Canvas sections

- Added `canvas_sections`.
- Added `canvas_notes.section_id`.
- Added persistent section wrapping, moving, resizing, renaming, and deletion.

### Stale deleted notes

- Canvas delete actions now return fresh server snapshots.
- Client selection is filtered against current server note IDs.
- This reduces stale note IDs causing later operations to fail.

### Text note save-on-blur

- Text notes use local draft state and save on blur.
- Failed saves roll back to server content.

### Fixed-size canvas dots

- Background grid no longer scales with zoom.
- Dot spacing stays visually stable while panning and zooming.

### Trackpad pan and native cursors

- Two-finger trackpad scroll pans in both axes.
- Ctrl/pinch wheel zoom remains available.
- Pan mode cursor uses native `grab` / `grabbing`.
- Cursor inheritance prevents hover flicker over notes and sections.

### Media dialog before image/video notes

- Image/video tools now open a dialog first.
- User chooses upload or link before placement.
- Notes appear only after server creation/upload succeeds.
- Upload failures do not create empty notes.

### Mobile desktop-only capture

- Mobile authenticated users see a URL capture form instead of the full dashboard/canvas.
- Submitted URLs create real bookmarks through the existing bookmark pipeline.

### First-memory onboarding

- Onboarding now asks users to save one real bookmark before entering the dashboard.
- The current onboarding UI is a prototype-faithful three-step animation with a persistent morphing stage card and real bookmark-preview polling.
- The success step is gated by a real normal `screenshot_url`; failed processing before the normal screenshot stays in the creating step with retry and skip actions.
- Dashboard and detail surfaces now prefer `long_screenshot_url`, falling back to the normal screenshot for old records and extension captures.
- The old mandatory workspace preference, focus area, and Telegram setup gates were removed from first-run onboarding.
- Telegram capture remains available from profile and through the existing Telegram API/webhook implementation.
- Users can still skip bookmark creation explicitly; skipped onboarding keeps empty preference fields valid in `user_onboarding`.

### Chrome extension web-session login

- Added `/api/extension/auth/start` and `/api/extension/auth/exchange`.
- The start route validates an allowlisted Chrome identity redirect URI and random state, then uses the current Nyabag web session to create a short-lived hashed exchange code.
- The exchange route consumes the code once, rejects expired/reused/redirect-mismatched codes, and returns a separate Supabase session compatible with existing extension bearer-token endpoints.
- `extension_auth_codes` stores only hashed codes and is accessible only from service-role server code.
- Extension bearer-token routes return stable authentication error codes with their existing HTTP status and message. The extension may display these diagnostics, but must redact tokens, authorization headers, cookies, passwords, and secrets.
- Extension sessions are stored with their API origin and validated through `/api/extension/me` after exchange, refresh, or cookie fallback. `/api/extension/captures` handles both bookmark-style saves and screenshot compression/storage, dispatching by whether `imageBase64` is present.
- The `/captures` gallery opens images in a body-portaled, full-viewport lightbox so the dashboard sidebar and clipped main panel cannot constrain it. Captures open fitted to the viewport and support zoom, drag panning, keyboard navigation, metadata, source actions, and deletion.

### Bookmark detail hydration date issue

- Date display was adjusted to avoid server/client locale mismatch issues.

### UI cleanup

- Dashboard moved toward a cleaner layout.
- Moodboard became the default bookmark view.
- Redundant view/ribbon controls were removed.
- Universal dashboard navigation/sidebar shell was added around dashboard pages.
- The redundant top Bookmarks/Canvas feature switch was removed; the sidebar is now the single app navigation surface, and the main content panel uses a shell-only curved left boundary.

## Suggested Future Improvements

1. Convert debug scripts to ESM or move them outside lint scope.
2. Replace simple alert-based bookmark delete rollback with an in-app toast/dialog.
3. Add Playwright smoke tests for:
   - bookmark create/delete,
   - canvas note creation,
   - media upload,
   - section wrapping,
   - mobile URL capture.
4. Add a self-hosted screenshot worker to reduce Microlink dependency.
5. Store richer metadata extraction results with versioning.
6. Add paste-to-create canvas notes.
7. Add minimap or "fit to content" refinements for large canvases.
8. Add collaborative cursors/multiplayer only after persistence is fully stable.
9. Add monitoring around screenshot failures and storage upload failures.
10. Consider a dedicated migration system instead of only maintaining `supabase/schema.sql`.

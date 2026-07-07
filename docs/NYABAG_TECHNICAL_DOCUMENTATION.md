# Nyabag Technical Documentation

Last updated: 2026-07-07

Nyabag is a desktop-first bookmark and notes workspace built with Next.js, Supabase, and React. It combines a visual bookmark moodboard with a FigJam-style infinite canvas for notes, links, media, social embeds, and grouped sections. This repo is now app-only for `app.nyabag.com`: the authenticated workspace lives at `/`, while marketing/editorial pages have been removed. This document is intended for future developers working on the codebase, deployment, debugging, and feature expansion.

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

Nyabag helps users collect websites and visual references, then organize ideas on a canvas. The product has two main surfaces:

- **Bookmarks**: a clean visual moodboard of saved websites, with screenshots, extracted palettes, tags, summaries, detected fonts, and detail pages.
- **Notes**: an infinite canvas inspired by FigJam/Figma, supporting draggable and resizable notes, media notes, social embeds, and grouped sections.

The app is currently desktop-first. Mobile authenticated users see a small capture-only interface where they can submit URLs as real bookmarks, then continue working on desktop.

## Feature Inventory

### Bookmarks

- Add, edit, and delete bookmarks.
- First-run onboarding asks users to save one real bookmark so the core product loop is visible before setup work.
- Moodboard-style bookmark grid.
- Cortex-backed active bookmark search. Hosted Cortex validates the internal token, scopes search by user, evidence-gates specific visual queries, and returns `nyabagBookmarkId` values; Nyabag owner-filters those IDs through Supabase before returning cards.
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

### Mobile URL Capture

- Login/signup remain available on mobile.
- Authenticated mobile users do not see the full desktop dashboard.
- Mobile users see a compact message that Nyabag works best on desktop.
- Mobile users can submit a website URL.
- The mobile URL uses the same `createBookmark` server action as desktop bookmark creation, so metadata, tags, palette, and screenshot behavior are shared.

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

src/hooks/
  useBookmarks.tsx                   Bookmark client state and filtering
  useNotes.tsx                       Canvas client state and optimistic sync

src/lib/
  actions.ts                         Bookmark/profile/auth server actions
  canvas-actions.ts                  Canvas server actions
  canvas-data.ts                     Server data loading for canvas
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

Legacy `/app/*` URLs are compatibility redirects handled by `src/proxy.ts`; do not add duplicate `/app` routes.

`DashboardShell` responsibilities:

- Reads sidebar collapsed state from `localStorage`.
- Uses `useSyncExternalStore` to avoid hydration drift for sidebar/mobile state.
- Detects mobile width using a 768px breakpoint.
- Shows `MobileBookmarkCapture` on mobile.
- Shows sidebar and page children on desktop.

## Supabase Data Model

The complete schema lives in `supabase/schema.sql`. It is designed to be safe to rerun and uses `DROP POLICY IF EXISTS` / `CREATE POLICY` patterns to avoid duplicate policy errors.

### `bookmarks`

Stores saved website references.

Important fields:

| Field | Purpose |
| --- | --- |
| `id` | Bookmark UUID |
| `user_id` | Owner, references `auth.users(id)` |
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
- RLS restricts rows to `auth.uid() = user_id`.

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
- RLS restricts rows to the owner.

### `canvas_sections`

Stores Figma-like sections.

Important fields:

- `id`
- `user_id`
- `label`
- `x`, `y`
- `width`, `height`
- `color`
- `z_index`
- timestamps

Sections are owner-scoped with RLS. Deleting a section should ungroup notes rather than delete them.

### Storage Buckets

| Bucket | Purpose | Visibility |
| --- | --- | --- |
| `canvas-media` | Uploaded image/video note files | Private, signed URL access |
| `profile-avatars` | User avatars | Public URL access |

`canvas-media` paths are structured under the user and note:

```text
{user_id}/{note_id}/{uuid}-{safe_filename}
```

The schema includes storage policies so users can only read/write their own object paths.

## Authentication and Security Model

Security is enforced at several layers:

1. **Route/layout layer**
   - Dashboard routes require Supabase session access through server-side clients.
   - Mobile users are gated to URL capture after authentication.

2. **Server action layer**
   - Every mutation calls `supabase.auth.getUser()`.
   - Mutations return `{ success: false, error: "Not authenticated" }` when no user exists.
   - Updates/deletes include `.eq("user_id", user.id)`.

3. **RLS layer**
   - Tables use row-level security.
   - Policies check `auth.uid() = user_id`.

4. **Storage layer**
   - Canvas media is private.
   - Signed URLs are generated server-side.
   - Media upload validates owner, note type, file MIME type, and file size.

5. **Validation layer**
   - Zod schemas validate bookmarks, profile updates, notes, sections, positions, sizes, and deletes.
   - Social notes validate supported social URL formats.
   - Media URLs are normalized and rejected if invalid.

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
3. Validate form data with `bookmarkCreateSchema`.
4. Normalize/parse URL.
5. Choose fallback title:
   - explicit user title
   - formatted domain
   - raw URL fallback
6. Resolve design data from known domain database or deterministic fallback.
7. Insert bookmark row with `processing_status = "queued"`.
8. Enqueue `bookmark_processing_jobs`.
9. Return immediately; Oracle polls and processes the queued job.
10. Revalidate `/`.

### Bookmark Update Flow

Main action: `updateBookmark(formData)`.

Flow:

1. Validate input with `bookmarkUpdateSchema`.
2. Fetch existing bookmark metadata.
3. If URL changed, clear stale normal and long preview fields and set `processing_status = "queued"`.
4. If URL did not change, preserve screenshots, palette, fonts, and summary where possible.
5. Update the owner-scoped row.
6. If URL changed, enqueue a new processing job for Oracle.
7. Revalidate `/`.

### Bookmark Delete Flow

Main action: `deleteBookmark(id)`.

Flow:

1. Resolve authenticated user.
2. Read screenshot paths and `cortex_memory_id` for cleanup.
3. Delete bookmark by `id` and `user_id`.
4. If no rows were affected, distinguish between not found and wrong owner where possible.
5. Revalidate `/`.
6. Best-effort call Cortex to delete matching Neon memory and embedding rows by bookmark id plus user id.
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

### `src/lib/actions.ts`

| Function | Purpose | Side effects |
| --- | --- | --- |
| `createBookmark(formData)` | Create bookmark and enqueue metadata/screenshot enrichment | Inserts `bookmarks`, enqueues Oracle work, revalidates `/` |
| `updateBookmark(formData)` | Update bookmark and refresh metadata if URL changes | Updates `bookmarks`, revalidates `/` |
| `deleteBookmark(id)` | Delete owner-scoped bookmark | Deletes `bookmarks`, revalidates `/` |
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
- `src/lib/cortex-actions.ts` posts `nyabagBookmarkId`, `userId`, `url`, `title`, `summary`, and a non-null screenshot URL to Cortex `/ingest` only after bookmark processing is ready.
- `deleteBookmark(id)` best-effort calls Cortex `DELETE /memories/bookmark/{nyabagBookmarkId}` with `CORTEX_INTERNAL_API_KEY` after the Supabase row is deleted, so stale Neon rows do not consume search result slots.
- `bookmarks.cortex_status`, `cortex_error`, `cortex_memory_id`, and `cortex_ingested_at` track deferred ingest separately from legacy semantic search columns.
- Active bookmark search calls internal-token-authenticated Cortex `/search` with `userId` and uses returned `nyabagBookmarkId` values as the authoritative ranking source.
- Cortex filters by `userId` before ranking; returned Cortex IDs are also filtered through owner-scoped Supabase queries and then reordered to Cortex order.
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
5. Add `CORTEX_API_URL=https://your-cortex-render-url.onrender.com` and `CORTEX_INTERNAL_API_KEY` for server-to-server Cortex search and delete cleanup.
6. Restart the dev server.

### Vercel Deployment

1. Push repo to GitHub.
2. Import project in Vercel.
3. Add Supabase environment variables.
4. Deploy.
5. Confirm Supabase auth redirect settings include the deployed domain.

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

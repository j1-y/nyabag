# Decision Log

## Decision: Nyabag is desktop-first

- Reason: The primary workflows are visual, multi-panel, and canvas-heavy, which are best on large screens.

## Decision: Mobile is capture-first

- Reason: Mobile should stay useful for quick URL capture without trying to mirror the full desktop workspace.

## Decision: Supabase is the primary backend

- Reason: Auth, storage, RLS, and iteration speed fit the product better than a custom backend at this stage.

## Decision: `docs/NYABAG_TECHNICAL_DOCUMENTATION.md` is the canonical architecture doc

- Reason: Future agents need one long-form source of truth, with `.ai-memory/` acting as the short-form working memory.

## Decision: Module-level `"use server"` actions are the default mutation pattern

- Reason: Shared mutation files are easier to locate, document, and validate across bookmarks, canvas, folders, onboarding, and admin.

## Decision: Memory docs must be updated alongside meaningful repo changes

- Reason: Nyabag should become more self-documenting over time instead of accumulating stale agent context.

## Decision: Reminder scripts should be warnings-only

- Reason: A memory-check helper should point out drift without mutating the repo or hiding review work.

## Decision: Bookmark search uses TypeScript fusion over a large SQL hybrid RPC (superseded)

- Reason: Superseded on 2026-07-06 by the hosted Cortex core search boundary. The old Supabase/RPC/fusion objects may remain in the database until an explicit cleanup migration, but they are no longer active app architecture.

## Decision: Temporal bookmark search is deterministic

- Reason: Save-date language has a finite grammar and must respect browser timezone boundaries without spending Gemini calls or risking nondeterministic date interpretation.

## Decision: `app.nyabag.com` is app-only

- Reason: The deployment should open directly to the authenticated product at `/`, with marketing/editorial pages removed and legacy `/app/*` URLs redirected to root equivalents for compatibility.

## Decision: Onboarding demonstrates value with one real memory

- Reason: New users should understand Nyabag by saving a real bookmark before configuration work. Workspace preferences, focus area, and Telegram connection remain outside the first-run gate and can be handled later from the dashboard/profile surfaces.

## Decision: Dashboard navigation lives in the sidebar

- Reason: The top Bookmarks/Canvas feature switch duplicated the sidebar and made the shell feel heavier. The authenticated app now uses the sidebar as the single navigation surface, with a curved white main panel as a layout-boundary exception to the normal 10px control radius.

## Decision: Product icons use Hugeicons Stroke Rounded only

- Reason: A single icon source keeps the UI visually consistent and prevents package drift. App icons should be imported as semantic aliases from `src/components/ui/icons.ts` and rendered through `HugeIcon`, which applies Nyabag defaults and clamps app icon sizes to at least 18px.

## Decision: Dashboard shell corners are viewport-fixed

- Reason: Dashboard pages can scroll independently of the viewport, so a curve applied only to the scrolling main panel disappears mid-scroll. The shell owns fixed top and bottom corner masks at the sidebar boundary while preserving normal page scroll behavior.

## Decision: Onboarding success requires a real screenshot

- Reason: The first-run success card should prove the core visual memory loop with an actual `screenshot_url`. If processing fails, onboarding stays in the creating step with retry/skip actions instead of showing placeholder success.

## Decision: Bookmark screenshots are split into normal and long captures

- Reason: Onboarding needs a fast, compact proof screenshot, while the app detail and moodboard surfaces need a longer visual memory. The processor now stores the normal top-viewport image in `screenshot_url` and the full-page app preview in `long_screenshot_url`, with app UI falling back to the normal image for old records and extension screenshots.

## Decision: Product typography uses Hanken Grotesk and Inter only

- Reason: A two-font system gives Nyabag a clean, product-focused heading voice while keeping body, control, and code-like UI text quiet and consistent. Hanken Grotesk is loaded for headings through `next/font/google`; Inter is loaded for all non-heading text. Legacy mono token names remain compatibility aliases only and resolve back to Inter.

## Decision: Cortex stays external and server-only

- Reason: Cortex is a hosted memory/search backend, not app code. Nyabag should call it through server-only helpers using `CORTEX_API_URL`, treat ingest as best-effort, and owner-filter returned bookmark IDs through Supabase before returning cards.

## Decision: Cortex is the active bookmark search authority

- Reason: Hosted Cortex replaces the app-side hybrid search stack. Active non-empty dashboard searches call Cortex `/search`, owner-filter returned `nyabagBookmarkId` values through Supabase, and render results in Cortex order. Empty search keeps local bookmark/tag/recent filtering. Cortex outages produce an unavailable search state rather than a lexical/Gemini/visual fallback.

## Decision: Cortex ingest waits for ready screenshots

- Reason: Cortex vision ingest requires a real screenshot URL, but bookmark creation rows start with null screenshot fields while Oracle work is queued. Nyabag now tracks ingest with dedicated `cortex_*` bookmark columns and posts to Cortex only after `processing_status = "ready"` and `long_screenshot_url` or `screenshot_url` exists.

## Decision: Bookmark deletes clean up Cortex best-effort

- Reason: Nyabag owner-filters Cortex search results through Supabase, so deleted bookmark rows do not render, but stale Neon memory and embedding rows can still waste Cortex ranking slots. Deletion now removes Supabase first, then best-effort calls an internal-key-protected Cortex delete endpoint.

## Decision: Retire Nyabag-side Gemini bookmark enrichment

- Reason: Cortex is now the AI memory/search authority. The old app/processor Gemini layer caused separate quota and availability failures while duplicating Cortex work, so Nyabag removes `bookmark_ai_metadata`, `bookmark_visual_facts`, bookmark `ai_*` fields, old AI UI, and direct Gemini dependencies.

## Decision: Oracle owns bookmark processing

- Reason: Screenshot and metadata processing now belongs to the external Oracle worker. Nyabag keeps the Supabase job queue contract but removes the old local/GitHub `processor/` worker, GitHub Actions dispatch, and processor check script.

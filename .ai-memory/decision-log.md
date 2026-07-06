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

## Decision: Bookmark search uses TypeScript fusion over a large SQL hybrid RPC

- Reason: PostgreSQL should provide owner-scoped weighted lexical retrieval and pgvector candidates, while TypeScript fusion stays easier to test, tune, and integrate with existing visual-memory modules.

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

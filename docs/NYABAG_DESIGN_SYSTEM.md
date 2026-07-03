# Nyabag Design System

Nyabag app UI should feel premium, engineered, compact, and consistent. New product work must start from the shared primitives in `src/components/ui` and the tokens in `src/app/globals.css`.

This document applies to the product app: dashboard, bookmarks, Canvas, dialogs, app layout, profile, admin, legal support pages, and loading states.

## Foundations

- Font family: `--font`, mapped to `var(--font-inter, 'Inter', sans-serif)`.
- Title font: `--font-title`, mapped to the same family unless deliberately changed at the app shell level.
- Monospace font: `--font-mono`, mapped to `--font` for a quiet, unified app feel.
- Body base: `15px` root size, compact app typography, no negative letter spacing in app chrome.

## Color

- All app chrome colors come from semantic tokens in `globals.css`.
- Canonical black is `--foreground-token: 0 0% 13%`, exposed as `--black`.
- Use Tailwind semantic classes such as `bg-surface`, `text-foreground`, `border-border`, `text-muted-foreground`, `bg-primary`, `text-destructive`, and `bg-success-soft`.
- Legacy aliases such as `--bg`, `--text`, `--border`, and `--accent` remain mapped for compatibility.
- Content colors, extracted palettes, default note colors, and demo palettes belong in `src/lib/content-colors.ts`, not in UI components.

## Spacing

Nyabag app spacing is based on 8px increments.

| Token | Value |
| --- | --- |
| `--space-0` | `0` |
| `--space-1` | `8px` |
| `--space-2` | `16px` |
| `--space-3` | `24px` |
| `--space-4` | `32px` |
| `--space-5` | `40px` |
| `--space-6` | `48px` |
| `--space-7` | `56px` |
| `--space-8` | `64px` |
| `--space-9` | `72px` |
| `--space-10` | `80px` |
| `--space-11` | `88px` |
| `--space-12` | `96px` |

Use Tailwind spacing utilities that resolve to 8px multiples: `p-2`, `p-4`, `p-6`, `gap-2`, `gap-4`, `mt-2`, `mb-4`, `px-4`, `py-2`. Avoid `p-1`, `p-3`, `p-5`, `gap-1`, `gap-3`, `px-3`, `py-1.5`, and other 4px/12px/20px steps in app chrome.

Typography metrics, 1px borders, transforms, z-index, shadows, canvas coordinates, and intrinsic media dimensions are not spacing tokens.

## Radius

- The only app border radius is `10px`.
- `--radius`, `--radius-xs`, `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`, and `--radius-full` all resolve to `10px`.
- Use `rounded-[10px]` in app components.
- Use `border-radius: 10px` or `border-radius: var(--radius)` in CSS.
- Use `0` only where an element is intentionally square or flush, such as link-style buttons with no visible container.
- Do not use pill/circle radii for avatars, badges, drag bars, handles, toolbar buttons, or switches in the product app.
- The dashboard shell may use `--dashboard-shell-curve` through `clip-path` only for the large boundary between the sidebar and main panel. Do not reuse that curve for controls, cards, or toolbars.

## Sizing

- Small control: `--control-sm: 32px`.
- Medium control: `--control-md: 40px`.
- Large control: `--control-lg: 48px`.
- Small icon: `--icon-sm: 16px`.
- Medium icon: `--icon-md: 24px`.

Toolbar buttons and dense actions should usually be `32px` or `40px`. Dialog actions and form controls should usually be `40px`.

## Components

- Use `Button` for actions and `IconButton` for icon-only actions.
- Use `Input`, `Textarea`, `Field`, `FieldLabel`, `FieldHint`, and `FieldError` for forms.
- Use `Dialog`, `Sheet`, `DropdownMenu`, `Popover`, `Tooltip`, and `Tabs` instead of hand-rolled overlays.
- Use `Card` only for grouped content. Avoid nested cards.
- Use `Badge` for metadata and `StatusBadge` for known workflow states.
- Canvas mechanics may keep custom classes for drag, resize, pan, grid, and embedded media, but app chrome around those mechanics must follow the same spacing, radius, and color rules.

## Enforcement

- `npm run check:colors` rejects raw app UI color literals outside token and content-color allowlists.
- `npm run check:design-system` rejects unsupported app radii and non-8px app spacing patterns in app-scoped files.
- `npm run lint` and `npx tsc --noEmit` must pass before merging UI changes.

Allowed exceptions are narrow: legal support pages, typography sizes and line heights, 1px borders, transforms, shadows, z-index, canvas coordinates, content colors, SVG geometry, and intrinsic media sizing.

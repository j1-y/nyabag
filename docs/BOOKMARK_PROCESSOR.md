# Bookmark Processor

## How It Works

When a user saves a URL, Nyabag immediately inserts a bookmark row with fallback title, user tags, fallback palette/fonts, no screenshot, and `processing_status = queued`. It also inserts a `bookmark_processing_jobs` row and best-effort triggers the GitHub Actions workflow.

Architecture:

```text
User saves URL
-> bookmark row queued
-> job row queued
-> GitHub Actions processor
-> Playwright short viewport screenshot
-> Sharp WebP
-> Supabase Storage
-> bookmark ready
```

The GitHub workflow also runs every 5 minutes. That scheduled run is the fallback if instant dispatch is skipped, debounced, or misconfigured.

## Statuses

- `queued`: bookmark is visible and waiting for the worker.
- `processing`: worker claimed the job and is preparing the preview.
- `ready`: screenshot and metadata are saved.
- `failed`: all retries failed; the UI shows a fallback and Retry button.

## Why It Is Separate

Screenshot generation is slow and fragile compared with saving a row. Playwright has to load external websites, wait briefly for the top viewport to stabilize, capture pixels, and Sharp has to compress the image. Moving that work into GitHub Actions keeps bookmark creation fast and avoids exposing service-role or GitHub tokens to browser code.

Nyabag bookmark screenshots are intentionally short top-viewport previews. The processor defaults to `SCREENSHOT_FULL_PAGE=false`, `SCREENSHOT_HEIGHT=900`, and `MAX_WEBP_HEIGHT=900` so saved memories load quickly and onboarding can show a compact real preview instead of a long-page capture.

## Required Supabase Schema

Run `supabase/schema.sql` in the Supabase SQL editor. It adds:

- `queued` bookmark processing status.
- `bookmark_processing_jobs`.
- `processor_trigger_state`.
- `claim_bookmark_processing_job(worker_id text)`.
- `enqueue_bookmark_processing_job(...)`.
- `request_processor_trigger(...)`.

The `bookmark-screenshots` bucket must remain public for preview URLs.

## GitHub Repository Secrets

Add these in GitHub repo settings under Secrets and variables -> Actions:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Do not use `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the processor.

## App Server Env Vars

Add these to the deployed Next.js app environment:

- `GITHUB_PROCESSOR_TOKEN`
- `GITHUB_REPO_OWNER`
- `GITHUB_REPO_NAME`
- `GITHUB_PROCESSOR_WORKFLOW_FILE=process-bookmarks.yml`
- `GITHUB_PROCESSOR_REF=main`

`GITHUB_PROCESSOR_TOKEN` should be a fine-grained personal access token scoped only to the Nyabag repo, with permission to trigger Actions workflows. Never expose it as `NEXT_PUBLIC_*`.

If these vars are missing, bookmark saving still works. Jobs will wait for the 5-minute scheduled workflow.

## Manual GitHub Actions Run

1. Open the repo on GitHub.
2. Go to Actions.
3. Select `Process Bookmark Jobs`.
4. Click `Run workflow`.
5. Choose the deployment branch, normally `main`.
6. Watch logs for `job claimed`, `screenshot completed`, `storage uploaded`, and `job ready`.

## Local Testing

From `processor/`:

```bash
npm install
npm run install-browsers
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... MAX_JOBS_PER_RUN=1 npm run process
```

PowerShell:

```powershell
cd processor
npm install
npm run install-browsers
$env:SUPABASE_URL="..."
$env:SUPABASE_SERVICE_ROLE_KEY="..."
$env:MAX_JOBS_PER_RUN="1"
npm run process
```

## Debugging

- If no job is claimed, check `bookmark_processing_jobs.status = queued` and `run_after <= now()`.
- If dispatch fails, check the app server logs for `[triggerBookmarkProcessor]`.
- If screenshots fail, inspect the GitHub Actions logs and the job `error_message`.
- If uploads fail, verify the `bookmark-screenshots` bucket exists and the service role key is correct.
- If the UI does not update, refresh the dashboard; polling runs while any bookmark is queued or processing.

## Moving Later

The `processor/` folder does not import Next.js app code. It can later move to Cloud Run, a VPS, or another worker host by keeping the same Supabase job table and environment variables.

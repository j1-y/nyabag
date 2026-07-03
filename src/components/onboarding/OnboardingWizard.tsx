"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useRef, useState, useTransition } from "react";
import { createBookmark, retryBookmarkProcessing } from "@/lib/actions";
import { getDomain, getFaviconUrl } from "@/lib/data";
import {
  completeOnboarding,
  getOnboardingBookmarkPreview,
  type OnboardingBookmarkPreview,
} from "@/lib/onboarding-actions";
import type { Bookmark } from "@/lib/types";

type StepNumber = 1 | 2 | 3;

const BUTTON_LOADING_MS = 500;
const TASK_ADVANCE_MS = 850;
const PREVIEW_POLL_MS = 2_500;
const PROCESSING_NOTICE_MS = 20_000;

const taskRows = [
  "Saving link",
  "Starting visual preview",
  "Preparing search details",
  "Opening your workspace",
];

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildBookmarkFormData(url: string) {
  const formData = new FormData();
  formData.append("url", url);
  formData.append("tags", "");
  formData.append("title", "");
  formData.append("note", "");
  return formData;
}

function validateClientUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();

  if (!trimmed) {
    return { success: false as const, error: "Paste a website URL to create your first memory." };
  }

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return { success: false as const, error: "Use a public HTTP or HTTPS website URL." };
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { success: false as const, error: "Use a public HTTP or HTTPS website URL." };
    }
    if (!parsed.hostname || !parsed.hostname.includes(".")) {
      return { success: false as const, error: "Enter a complete website URL, like example.com." };
    }
    parsed.hash = "";
    return { success: true as const, url: parsed.toString() };
  } catch {
    return { success: false as const, error: "Enter a complete website URL, like example.com." };
  }
}

function previewFromBookmark(bookmark: Bookmark): OnboardingBookmarkPreview {
  return {
    id: bookmark.id,
    url: bookmark.url,
    title: bookmark.title,
    screenshot_url: bookmark.screenshot_url,
    processing_status: bookmark.processing_status,
    processing_error: bookmark.processing_error,
    metadata_refreshed_at: bookmark.metadata_refreshed_at,
    screenshot_refreshed_at: bookmark.screenshot_refreshed_at,
    semantic_status: bookmark.semantic_status,
    updated_at: bookmark.updated_at,
  };
}

function hasScreenshotPreview(bookmark: OnboardingBookmarkPreview) {
  return Boolean(bookmark.screenshot_url);
}

function hasProcessingFailed(bookmark: OnboardingBookmarkPreview | null) {
  return bookmark?.processing_status === "failed" && !bookmark.screenshot_url;
}

function isUrlError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("url") ||
    lower.includes("http") ||
    lower.includes("hostname") ||
    lower.includes("resolve") ||
    lower.includes("private") ||
    lower.includes("internal")
  );
}

function dotClassName(index: StepNumber, step: StepNumber) {
  return [
    index === step ? "is-active" : "",
    index < step ? "is-done" : "",
  ].filter(Boolean).join(" ");
}

function stepClassName(index: StepNumber, step: StepNumber) {
  return `step${index === step ? " is-active" : ""}`;
}

function taskClassName(
  index: number,
  activeTaskIndex: number,
  failedTaskIndex: number | null = null
) {
  const isFailed = index === failedTaskIndex;
  return [
    "task-row",
    isFailed ? "is-failed" : "",
    index === activeTaskIndex && !isFailed ? "is-active" : "",
    index < activeTaskIndex ? "is-done" : "",
  ].filter(Boolean).join(" ");
}

function displayDomain(url: string | undefined) {
  if (!url) return "Saved memory";
  return getDomain(url) || "Saved memory";
}

function displayTitle(bookmark: OnboardingBookmarkPreview | null) {
  const title = bookmark?.title?.trim();
  if (title) return title;

  const domain = displayDomain(bookmark?.url);
  return domain === "Saved memory"
    ? domain
    : `${domain.charAt(0).toUpperCase()}${domain.slice(1)}`;
}

export function OnboardingWizard() {
  const router = useRouter();
  const flowIdRef = useRef(0);
  const [url, setUrl] = useState("");
  const [step, setStep] = useState<StepNumber>(1);
  const [activeTaskIndex, setActiveTaskIndex] = useState(-1);
  const [createdBookmark, setCreatedBookmark] = useState<OnboardingBookmarkPreview | null>(null);
  const [fieldError, setFieldError] = useState("");
  const [error, setError] = useState("");
  const [processingNotice, setProcessingNotice] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [retryLoading, setRetryLoading] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isPending, startTransition] = useTransition();

  const hasFailedPreview = hasProcessingFailed(createdBookmark);
  const isProcessing = step === 2 && !hasFailedPreview;
  const isBusy = createLoading || isCompleting || isPending || retryLoading || isProcessing;

  function isCurrentFlow(flowId: number) {
    return flowIdRef.current === flowId;
  }

  function setStepUI(nextStep: StepNumber, nextTaskIndex?: number) {
    setStep(nextStep);
    setActiveTaskIndex(
      nextTaskIndex ??
        (nextStep === 1 ? -1 : nextStep === 2 ? 0 : taskRows.length)
    );
  }

  async function fetchPreview(bookmarkId: string) {
    const result = await getOnboardingBookmarkPreview(bookmarkId);
    if (!result.success) return null;
    setCreatedBookmark(result.data);
    return result.data;
  }

  async function runTask(
    flowId: number,
    index: number,
    work?: () => Promise<void>
  ) {
    if (!isCurrentFlow(flowId)) return;

    setActiveTaskIndex(index);
    const startedAt = Date.now();
    if (work) await work();

    const remaining = Math.max(0, TASK_ADVANCE_MS - (Date.now() - startedAt));
    if (remaining > 0) await sleep(remaining);

    if (isCurrentFlow(flowId)) {
      setActiveTaskIndex(index + 1);
    }
  }

  async function waitForScreenshot(
    flowId: number,
    initialBookmark: OnboardingBookmarkPreview
  ) {
    let latest = initialBookmark;
    const noticeAt = Date.now() + PROCESSING_NOTICE_MS;
    let noticeShown = false;

    while (
      isCurrentFlow(flowId) &&
      !hasScreenshotPreview(latest) &&
      !hasProcessingFailed(latest)
    ) {
      await sleep(PREVIEW_POLL_MS);
      if (!isCurrentFlow(flowId)) return latest;

      const next = await fetchPreview(latest.id);
      if (next) latest = next;

      if (
        !noticeShown &&
        Date.now() >= noticeAt &&
        !hasScreenshotPreview(latest) &&
        !hasProcessingFailed(latest)
      ) {
        setProcessingNotice(
          "Still capturing the screenshot. You can keep this open or skip for now."
        );
        noticeShown = true;
      }
    }

    return latest;
  }

  async function runProcessingTasks(
    flowId: number,
    initialBookmark: OnboardingBookmarkPreview
  ) {
    let latest = initialBookmark;
    setProcessingNotice("");

    await runTask(flowId, 1, async () => {
      const next = await fetchPreview(latest.id);
      if (next) latest = next;
    });

    if (!isCurrentFlow(flowId)) return false;

    setActiveTaskIndex(2);
    const screenshotStartedAt = Date.now();
    latest = await waitForScreenshot(flowId, latest);
    const screenshotRemaining = Math.max(
      0,
      TASK_ADVANCE_MS - (Date.now() - screenshotStartedAt)
    );
    if (screenshotRemaining > 0) await sleep(screenshotRemaining);

    if (!isCurrentFlow(flowId)) return false;

    setCreatedBookmark(latest);

    if (!hasScreenshotPreview(latest)) {
      setActiveTaskIndex(2);
      return false;
    }

    setActiveTaskIndex(3);
    await runTask(flowId, 3);

    if (!isCurrentFlow(flowId)) return false;
    setCreatedBookmark(latest);
    setStepUI(3, taskRows.length);
    return true;
  }

  async function runCreateFlow(normalizedUrl: string, flowId: number) {
    const loadingStartedAt = Date.now();
    const result = await createBookmark(buildBookmarkFormData(normalizedUrl));
    const remaining = Math.max(0, BUTTON_LOADING_MS - (Date.now() - loadingStartedAt));
    if (remaining > 0) await sleep(remaining);

    if (!isCurrentFlow(flowId)) return;

    if (!result.success) {
      if (isUrlError(result.error)) setFieldError(result.error);
      else setError(result.error);
      setCreateLoading(false);
      setStepUI(1);
      return;
    }

    const latest = previewFromBookmark(result.data);
    setCreatedBookmark(latest);
    setCreateLoading(false);
    setStepUI(2, 0);

    await runTask(flowId, 0);
    await runProcessingTasks(flowId, latest);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy) return;

    const parsed = validateClientUrl(url);
    setError("");
    setFieldError("");

    if (!parsed.success) {
      setFieldError(parsed.error);
      return;
    }

    const flowId = flowIdRef.current + 1;
    flowIdRef.current = flowId;
    setCreatedBookmark(null);
    setProcessingNotice("");
    setCreateLoading(true);
    setStepUI(1);

    startTransition(() => {
      void runCreateFlow(parsed.url, flowId);
    });
  }

  function finishOnboarding() {
    if (isCompleting || retryLoading) return;

    flowIdRef.current += 1;
    setError("");
    setFieldError("");
    setIsCompleting(true);

    startTransition(async () => {
      const result = await completeOnboarding();

      if (!result.success) {
        setError(result.error);
        setIsCompleting(false);
        return;
      }

      router.replace("/");
    });
  }

  function retryPreviewProcessing() {
    if (!createdBookmark || retryLoading) return;

    const flowId = flowIdRef.current + 1;
    flowIdRef.current = flowId;
    setError("");
    setFieldError("");
    setProcessingNotice("");
    setRetryLoading(true);
    setStepUI(2, 1);

    startTransition(() => {
      void (async () => {
        const result = await retryBookmarkProcessing(createdBookmark.id);

        if (!isCurrentFlow(flowId)) return;

        if (!result.success) {
          setError(result.error);
          setRetryLoading(false);
          setActiveTaskIndex(2);
          return;
        }

        const latest = previewFromBookmark(result.data);
        setCreatedBookmark(latest);
        setRetryLoading(false);
        await runProcessingTasks(flowId, latest);
      })();
    });
  }

  return (
    <main className="onboarding-app onboarding-shell" aria-busy={isBusy}>
      <div className="stage" id="stage" data-step={step}>
        <div className="stage-grid" />
        <div className="stage-glow" />

        <div className="scene">
          <div className="ghost-card g1" />
          <div className="ghost-card g2" />
          <div className="ghost-card g3" />

          <div className="particles" aria-hidden="true">
            <span className="p1" />
            <span className="p2" />
            <span className="p3" />
            <span className="p4" />
            <span className="p5" />
            <span className="p6" />
          </div>

          <div className="main-card">
            <div className="card-chrome" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="card-body">
              <div className="layer layer-idle">
                <div className="idle-frame">
                  <div className="idle-cursor" />
                </div>
                <div className="idle-caption">Waiting for a link</div>
              </div>

              <div className="layer layer-loading">
                <div className="scan-sweep" />
                <div className="bar b1" />
                <div className="bar b2" />
                <div className="bar b3" />
                <div className="bar b4" />
              </div>

              <div className="layer layer-done">
                <StageDonePreview bookmark={createdBookmark} />
              </div>
            </div>
            <div className="badge-check" aria-hidden="true">
              <svg viewBox="0 0 18 18" fill="none">
                <path d="M4 9.3L7 12.3L14 5.3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-inner">
          <div className="brand-row">
            <Image
              src="/assets/logo.svg"
              alt="Nyabag"
              width={594}
              height={118}
              className="brand-logo"
              unoptimized
            />
          </div>

          {error && (
            <p className="onboarding-error" role="alert">
              <span aria-hidden="true">!</span>
              {error}
            </p>
          )}

          <section className={stepClassName(1, step)} id="step1" aria-hidden={step !== 1}>
            <h1>Save your <em>first</em> memory</h1>
            <p className="lede">Paste a website, product, or design reference. Nyabag will save it as a visual memory you can search later.</p>

            <form onSubmit={handleSubmit}>
              <label className="field-label" htmlFor="urlInput">Website URL</label>
              <div className={`input-wrap${fieldError ? " is-invalid" : ""}`}>
                <input
                  type="text"
                  id="urlInput"
                  name="url"
                  placeholder="Paste a website URL"
                  autoComplete="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="url"
                  value={url}
                  disabled={isBusy}
                  aria-invalid={Boolean(fieldError)}
                  aria-describedby={fieldError ? "urlInput-error" : undefined}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    setFieldError("");
                    setError("");
                  }}
                />
                <div className="input-underline" />
              </div>
              {fieldError && (
                <p className="field-error" id="urlInput-error" role="alert">
                  <span aria-hidden="true">!</span>
                  {fieldError}
                </p>
              )}

              <div className="actions-row">
                <button className={`btn${createLoading ? " is-loading" : ""}`} id="createBtn" type="submit" disabled={isBusy}>
                  <span className="btn-label">Create Bookmark</span>
                  <span className="btn-spinner" aria-hidden="true" />
                </button>
                <button className="link-quiet" id="skipBtn1" type="button" onClick={finishOnboarding} disabled={isBusy}>
                  I&apos;ll add one later
                </button>
              </div>
            </form>
          </section>

          <section className={stepClassName(2, step)} id="step2" aria-hidden={step !== 2} aria-live="polite">
            <h1>Creating your memory</h1>
            <p className="lede">Hang tight, Nyabag is turning that link into something you can search later.</p>

            <div className="task-list" id="taskList">
              {taskRows.map((task, index) => (
                <div
                  className={taskClassName(index, activeTaskIndex, hasFailedPreview ? 2 : null)}
                  data-task
                  key={task}
                >
                  <span className="task-icon">
                    <span className="ring" />
                    <svg className="check" viewBox="0 0 18 18" aria-hidden="true">
                      <circle cx="9" cy="9" r="9" />
                      <path d="M5 9.3L7.6 12L13 6" />
                    </svg>
                  </span>
                  <span className="task-label">{task}</span>
                </div>
              ))}
            </div>

            {processingNotice && !hasFailedPreview && (
              <p className="processing-note">{processingNotice}</p>
            )}

            {hasFailedPreview ? (
              <div className="processing-failure" role="alert">
                <p>Screenshot capture failed. Try again or add one later.</p>
                {createdBookmark?.processing_error && (
                  <span>{createdBookmark.processing_error}</span>
                )}
                <div className="processing-failure-actions">
                  <button
                    className={`btn${retryLoading ? " is-loading" : ""}`}
                    type="button"
                    onClick={retryPreviewProcessing}
                    disabled={retryLoading || isCompleting}
                  >
                    <span className="btn-label">Retry</span>
                    <span className="btn-spinner" aria-hidden="true" />
                  </button>
                  <button
                    className="link-quiet"
                    type="button"
                    onClick={finishOnboarding}
                    disabled={retryLoading || isCompleting}
                  >
                    I&apos;ll add one later
                  </button>
                </div>
              </div>
            ) : (
              <div className="processing-actions">
                <button
                  className="link-quiet"
                  id="skipBtn2"
                  type="button"
                  onClick={finishOnboarding}
                  disabled={isCompleting}
                >
                  I&apos;ll add one later
                </button>
              </div>
            )}
          </section>

          <section className={stepClassName(3, step)} id="step3" aria-hidden={step !== 3}>
            <h1>Your first memory is saved</h1>
            <p className="lede">Your link is ready in your library with a fresh preview.</p>

            <div className="success-footer">
              <button className={`btn${isCompleting ? " is-loading" : ""}`} id="openBtn" type="button" onClick={finishOnboarding} disabled={isCompleting}>
                <span className="btn-label">Open Nyabag <span className="btn-arrow">&rarr;</span></span>
                <span className="btn-spinner" aria-hidden="true" />
              </button>
              <button className="link-quiet" type="button" onClick={finishOnboarding} disabled={isCompleting}>
                I&apos;ll add one later
              </button>
            </div>
          </section>

          <div className="step-dots" id="stepDots" aria-hidden="true">
            <span className={dotClassName(1, step)} data-dot="1" />
            <span className={dotClassName(2, step)} data-dot="2" />
            <span className={dotClassName(3, step)} data-dot="3" />
          </div>
        </div>
      </div>
    </main>
  );
}

function StageDonePreview({ bookmark }: { bookmark: OnboardingBookmarkPreview | null }) {
  const domain = displayDomain(bookmark?.url);
  const faviconUrl = bookmark?.url ? getFaviconUrl(bookmark.url) : null;
  const title = displayTitle(bookmark);
  const hasScreenshot = Boolean(bookmark?.screenshot_url);

  return (
    <div className="done-preview">
      <div
        className={`done-preview-shot${hasScreenshot ? " has-image" : ""}`}
        style={
          hasScreenshot
            ? { backgroundImage: `url(${bookmark?.screenshot_url})` }
            : undefined
        }
        role={hasScreenshot ? "img" : undefined}
        aria-label={hasScreenshot ? `${title} preview` : undefined}
      >
        {!hasScreenshot && (
          <div className="done-preview-pending" aria-hidden="true" />
        )}
      </div>
      <div className="done-site-card">
        <span
          className={`done-favicon${faviconUrl ? " has-image" : ""}`}
          style={faviconUrl ? { backgroundImage: `url(${faviconUrl})` } : undefined}
          aria-hidden="true"
        >
          {!faviconUrl ? domain.charAt(0).toUpperCase() : null}
        </span>
        <div className="done-preview-copy">
          <strong>{title}</strong>
          <span>{domain}</span>
        </div>
      </div>
    </div>
  );
}

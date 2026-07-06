import "server-only";

import { createClient } from "@/lib/supabase/server";

const TRIGGER_KEY = "bookmark-processor";
const DEFAULT_REF = "main";
const DEBOUNCE_SECONDS = 30;

type TriggerResult = {
  success: boolean;
  error?: string;
  reason?: string;
};

type ProcessorMode = "github" | "oracle" | "external";

function getProcessorMode(): ProcessorMode {
  const mode = (process.env.BOOKMARK_PROCESSOR_MODE || "github")
    .trim()
    .toLowerCase();

  if (mode === "oracle" || mode === "external") {
    return mode;
  }

  return "github";
}

function getRequiredEnv() {
  const token = process.env.GITHUB_PROCESSOR_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  const workflowFile =
    process.env.GITHUB_PROCESSOR_WORKFLOW_FILE || "process-bookmarks.yml";

  const missing = [
    ["GITHUB_PROCESSOR_TOKEN", token],
    ["GITHUB_REPO_OWNER", owner],
    ["GITHUB_REPO_NAME", repo],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    return {
      ok: false as const,
      error: `GitHub processor env vars are not configured: ${missing.join(", ")}`,
    };
  }

  return {
    ok: true as const,
    token: token!,
    owner: owner!,
    repo: repo!,
    workflowFile,
    ref: process.env.GITHUB_PROCESSOR_REF || DEFAULT_REF,
  };
}

async function shouldDispatchNow(): Promise<
  TriggerResult & { shouldTrigger: boolean }
> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("request_processor_trigger", {
      trigger_key: TRIGGER_KEY,
      debounce_seconds: DEBOUNCE_SECONDS,
    });

    if (error) {
      console.error(
        "[triggerBookmarkProcessor] Debounce RPC failed:",
        error.message
      );

      return {
        success: true,
        shouldTrigger: true,
        reason: "debounce-unavailable",
      };
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (row && row.should_trigger === false) {
      return {
        success: true,
        shouldTrigger: false,
        reason: row.reason ?? "debounced",
      };
    }

    return {
      success: true,
      shouldTrigger: true,
      reason: row?.reason ?? "triggered",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Debounce check failed";

    console.error("[triggerBookmarkProcessor] Debounce check failed:", message);

    return {
      success: true,
      shouldTrigger: true,
      reason: "debounce-error",
    };
  }
}

export async function triggerBookmarkProcessor(): Promise<TriggerResult> {
  const mode = getProcessorMode();

  /**
   * Oracle/external mode:
   *
   * The Nyabag app only creates the bookmark row and queues a
   * bookmark_processing_jobs row. The Oracle worker polls Supabase,
   * claims queued jobs, and performs screenshot + AI processing.
   *
   * In this mode, the app should not dispatch GitHub Actions.
   */
  if (mode === "oracle" || mode === "external") {
    return {
      success: true,
      reason: `${mode}-worker-polls-supabase`,
    };
  }

  const env = getRequiredEnv();

  if (!env.ok) {
    return {
      success: false,
      error: env.error,
    };
  }

  const debounce = await shouldDispatchNow();

  if (!debounce.shouldTrigger) {
    return {
      success: true,
      reason: debounce.reason,
    };
  }

  const endpoint = `https://api.github.com/repos/${encodeURIComponent(
    env.owner
  )}/${encodeURIComponent(env.repo)}/actions/workflows/${encodeURIComponent(
    env.workflowFile
  )}/dispatches`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref: env.ref }),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");

      return {
        success: false,
        error: `GitHub workflow dispatch failed (${response.status}): ${body.slice(
          0,
          300
        )}`,
      };
    }

    return {
      success: true,
      reason: debounce.reason,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "GitHub workflow dispatch failed",
    };
  }
}
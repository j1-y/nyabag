import dns from "node:dns/promises";
import ws from "ws";
import net from "node:net";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import sharp from "sharp";
import {
  analyzeBookmarkScreenshot,
  extractPaletteFromImage,
  upsertAiFailed,
} from "./bookmark-ai.mjs";
import { enrichVisualFactsWithAi, extractVisualFacts, mergeVisualFacts, upsertVisualFacts } from "./visual-facts.mjs";

const BUCKET = "bookmark-screenshots";

const DEFAULT_PALETTES = [
  ["#3B82F6", "#EFF6FF", "#1E3A5F", "#93C5FD", "#DBEAFE"],
  ["#8B5CF6", "#EDE9FE", "#4C1D95", "#C4B5FD", "#DDD6FE"],
  ["#10B981", "#ECFDF5", "#064E3B", "#6EE7B7", "#D1FAE5"],
  ["#F59E0B", "#FFFBEB", "#78350F", "#FCD34D", "#FEF3C7"],
  ["#EF4444", "#FEF2F2", "#7F1D1D", "#FCA5A5", "#FEE2E2"],
  ["#EC4899", "#FDF2F8", "#831843", "#F9A8D4", "#FCE7F3"],
  ["#14B8A6", "#F0FDFA", "#134E4A", "#5EEAD4", "#CCFBF1"],
  ["#F97316", "#FFF7ED", "#7C2D12", "#FDBA74", "#FED7AA"],
];

const DEFAULT_FONTS = [
  ["Inter", "Georgia"],
  ["Roboto", "Playfair Display"],
  ["Poppins", "Lora"],
  ["Lato", "Merriweather"],
  ["Nunito", "Source Serif Pro"],
  ["Outfit", "DM Serif Display"],
  ["Plus Jakarta Sans", "EB Garamond"],
];

const CATEGORY_RULES = [
  ["design", ["design", "portfolio", "inspiration", "ui", "ux", "creative", "branding"]],
  ["development", ["developer", "code", "software", "api", "github", "framework", "documentation"]],
  ["ai", ["ai", "artificial intelligence", "machine learning", "llm", "automation"]],
  ["productivity", ["productivity", "workspace", "docs", "notes", "tasks", "collaboration"]],
  ["news", ["news", "journalism", "article", "media", "magazine"]],
  ["social", ["social", "community", "network", "followers", "posts"]],
  ["video", ["video", "streaming", "watch", "clips", "channel"]],
  ["tools", ["tool", "platform", "dashboard", "workflow", "service", "app"]],
];

const GENERIC_WORDS = new Set([
  "about",
  "after",
  "also",
  "best",
  "from",
  "have",
  "into",
  "official",
  "online",
  "page",
  "that",
  "their",
  "this",
  "website",
  "with",
  "your",
]);

function envNumber(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function seedFor(value) {
  return value.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
}

function fallbackPalette(url) {
  const domain = getDomain(url);
  return DEFAULT_PALETTES[seedFor(domain) % DEFAULT_PALETTES.length];
}

function fallbackFonts(url) {
  const domain = getDomain(url);
  return DEFAULT_FONTS[seedFor(domain) % DEFAULT_FONTS.length];
}

function normalizeTag(tag) {
  return tag
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferTags(url, title, summary) {
  const text = `${getDomain(url)} ${title} ${summary}`.toLowerCase();
  const tags = [];

  for (const [tag, terms] of CATEGORY_RULES) {
    if (terms.some((term) => text.includes(term))) tags.push(tag);
  }

  const words = text.match(/\b[a-z][a-z0-9-]{3,}\b/g) ?? [];
  for (const word of words) {
    if (!GENERIC_WORDS.has(word)) tags.push(normalizeTag(word));
    if (tags.length >= 8) break;
  }

  return Array.from(new Set(tags.filter(Boolean))).slice(0, 8);
}

function mergeTags(existingTags, inferredTags) {
  const seen = new Set();
  const merged = [];

  for (const value of [...(existingTags ?? []), ...(inferredTags ?? [])]) {
    const tag = normalizeTag(String(value ?? ""));
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    merged.push(tag);
    if (merged.length >= 20) break;
  }

  return merged;
}

function isPrivateIPv4(address) {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;

  const [a, b] = parts;

  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

function isBlockedHostname(hostname) {
  const lower = hostname.toLowerCase();

  return (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower === "0.0.0.0" ||
    lower === "::1"
  );
}

async function assertSafeUrl(rawUrl) {
  let parsed;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https URLs are supported");
  }

  if (isBlockedHostname(parsed.hostname)) {
    throw new Error("Localhost URLs are not allowed");
  }

  const ipVersion = net.isIP(parsed.hostname);

  if (ipVersion === 4 && isPrivateIPv4(parsed.hostname)) {
    throw new Error("Private network URLs are not allowed");
  }

  if (ipVersion === 6) {
    throw new Error("IPv6 literal URLs are not allowed");
  }

  const addresses = await dns.lookup(parsed.hostname, {
    all: true,
    verbatim: true,
  });

  for (const address of addresses) {
    if (address.family === 4 && isPrivateIPv4(address.address)) {
      throw new Error("Private network URLs are not allowed");
    }

    if (
      address.family === 6 &&
      ["::1", "fc", "fd", "fe80"].some((prefix) =>
        address.address.toLowerCase().startsWith(prefix)
      )
    ) {
      throw new Error("Private network URLs are not allowed");
    }
  }

  return parsed.toString();
}

function toggleWwwHostname(hostname) {
  if (hostname.startsWith("www.")) {
    return hostname.slice(4);
  }

  return `www.${hostname}`;
}

function getUrlCandidates(rawUrl) {
  const candidates = [];

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return [rawUrl];
  }

  candidates.push(parsed.toString());

  const toggled = new URL(parsed.toString());
  toggled.hostname = toggleWwwHostname(parsed.hostname);
  candidates.push(toggled.toString());

  return Array.from(new Set(candidates));
}

async function resolveSafeUrl(rawUrl) {
  const candidates = getUrlCandidates(rawUrl);
  let lastError = null;

  for (const candidate of candidates) {
    try {
      return await assertSafeUrl(candidate);
    } catch (error) {
      lastError = error;
      console.log(
        `[processor] URL candidate failed: ${candidate}`,
        error instanceof Error ? error.message : error
      );
    }
  }

  throw lastError ?? new Error("Could not resolve URL");
}

async function claimJob(supabase, workerId) {
  const { data, error } = await supabase.rpc("claim_bookmark_processing_job", {
    worker_id: workerId,
  });

  if (error) {
    throw new Error(`Could not claim job: ${error.message}`);
  }

  const job = Array.isArray(data) ? data[0] : data;

  if (
    !job ||
    !job.id ||
    job.id === "null" ||
    !job.bookmark_id ||
    job.bookmark_id === "null" ||
    !job.user_id ||
    job.user_id === "null" ||
    !job.url
  ) {
    return null;
  }

  return job;
}

async function updateBookmarkProcessing(supabase, job) {
  const { error } = await supabase
    .from("bookmarks")
    .update({
      processing_status: "processing",
      processing_error: null,
      enrichment_started_at: nowIso(),
      enrichment_finished_at: null,
    })
    .eq("id", job.bookmark_id)
    .eq("user_id", job.user_id)
    .eq("url", job.url);

  if (error) {
    throw new Error(`Could not mark bookmark processing: ${error.message}`);
  }
}

async function extractMetadata(page, url) {
  const metadata = await page.evaluate(() => {
    const meta = (...names) => {
      for (const name of names) {
        const selector = `meta[name="${name}"], meta[property="${name}"]`;
        const value = document.querySelector(selector)?.getAttribute("content");
        if (value) return value;
      }

      return "";
    };

    const title = meta("og:title", "twitter:title") || document.title || "";

    const summary =
      meta("description", "og:description", "twitter:description") || "";

    const font = getComputedStyle(document.body).fontFamily || "";

    return { title, summary, font };
  });

  const title = cleanText(metadata.title);
  const summary = cleanText(metadata.summary).slice(0, 1000);

  const pageFont = cleanText(metadata.font)
    .split(",")[0]
    ?.replaceAll("\"", "")
    .trim();

  const fonts = pageFont
    ? Array.from(new Set([pageFont, ...fallbackFonts(url)])).slice(0, 4)
    : fallbackFonts(url);

  return {
    title,
    summary,
    tags: inferTags(url, title, summary),
    fonts,
    refreshedAt: nowIso(),
  };
}

function compactFontFamily(value) {
  return cleanText(value)
    .split(",")[0]
    ?.replaceAll("\"", "")
    .replaceAll("'", "")
    .trim();
}

async function extractDomDesignData(page, url) {
  const observed = await page.evaluate(() => {
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 1 &&
        rect.height > 1 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        Number.parseFloat(style.opacity || "1") > 0.05
      );
    };

    const text = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const meta = (...names) => {
      for (const name of names) {
        const selector = `meta[name="${name}"], meta[property="${name}"]`;
        const value = document.querySelector(selector)?.getAttribute("content");
        if (value) return value;
      }
      return "";
    };

    const elements = Array.from(document.querySelectorAll("body *"))
      .filter(isVisible)
      .slice(0, 900);

    const fontCounts = new Map();
    const colorCounts = new Map();
    const backgroundCounts = new Map();
    const roleFonts = {};
    const roleSamples = {
      headings: [],
      buttons: [],
      nav: [],
      links: [],
      inputs: [],
      cards: [],
    };

    const addCount = (map, value) => {
      const next = text(value);
      if (!next || next === "rgba(0, 0, 0, 0)") return;
      map.set(next, (map.get(next) ?? 0) + 1);
    };

    const addRoleFont = (role, value) => {
      if (!value) return;
      roleFonts[role] ??= {};
      roleFonts[role][value] = (roleFonts[role][value] ?? 0) + 1;
    };

    const addSample = (role, value) => {
      const next = text(value);
      if (!next || next.length < 2 || roleSamples[role].includes(next)) return;
      if (roleSamples[role].length < 12) roleSamples[role].push(next.slice(0, 90));
    };

    for (const element of elements) {
      const style = getComputedStyle(element);
      const tag = element.tagName.toLowerCase();
      const className = String(element.className || "");
      const content = text(element.textContent).slice(0, 120);
      const font = style.fontFamily;

      addCount(fontCounts, font);
      addCount(colorCounts, style.color);
      addCount(backgroundCounts, style.backgroundColor);
      if (style.borderColor && style.borderStyle !== "none") addCount(colorCounts, style.borderColor);

      if (/^h[1-6]$/.test(tag)) {
        addRoleFont("headings", font);
        addSample("headings", content);
      } else if (tag === "button" || element.getAttribute("role") === "button") {
        addRoleFont("buttons", font);
        addSample("buttons", content);
      } else if (tag === "nav" || element.closest("nav")) {
        addRoleFont("nav", font);
        addSample("nav", content);
      } else if (tag === "a") {
        addRoleFont("links", font);
        addSample("links", content);
      } else if (["input", "textarea", "select"].includes(tag)) {
        addRoleFont("inputs", font);
        addSample("inputs", element.getAttribute("placeholder") || content);
      }

      if (
        className.toLowerCase().includes("card") ||
        element.getAttribute("role") === "article" ||
        tag === "article"
      ) {
        addRoleFont("cards", font);
        addSample("cards", content);
      }
    }

    const topEntries = (map, limit) =>
      Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([value, count]) => ({ value, count }));

    const sections = Array.from(document.querySelectorAll("section, article, main > div, [class*='section'], [class*='card']"))
      .filter(isVisible)
      .slice(0, 30)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: String(element.className || "").slice(0, 90),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          text: text(element.textContent).slice(0, 140),
        };
      });

    return {
      metadata: {
        title: document.title || "",
        description: meta("description", "og:description", "twitter:description"),
        ogTitle: meta("og:title", "twitter:title"),
        canonical: document.querySelector("link[rel='canonical']")?.getAttribute("href") || "",
      },
      typography: {
        fonts: topEntries(fontCounts, 12),
        roleFonts,
      },
      colors: {
        textColors: topEntries(colorCounts, 14),
        backgrounds: topEntries(backgroundCounts, 14),
      },
      layout: {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        page: {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        },
        counts: {
          headings: document.querySelectorAll("h1,h2,h3,h4,h5,h6").length,
          buttons: document.querySelectorAll("button,[role='button']").length,
          links: document.querySelectorAll("a[href]").length,
          forms: document.querySelectorAll("form,input,textarea,select").length,
          images: document.querySelectorAll("img,svg,picture,video").length,
          navs: document.querySelectorAll("nav").length,
        },
        samples: roleSamples,
        sections,
      },
    };
  });

  const fontCandidates = [];
  for (const entry of observed.typography.fonts ?? []) {
    const font = compactFontFamily(entry.value);
    if (font && !fontCandidates.includes(font)) fontCandidates.push(font);
  }

  return {
    ...observed,
    metadata: {
      ...observed.metadata,
      url,
      domain: getDomain(url),
    },
    typography: {
      ...observed.typography,
      fontCandidates: fontCandidates.slice(0, 8),
    },
  };
}

async function preparePageForScreenshot(page, timeoutMs, fullPage) {
  console.log("[processor] preparing dynamic page");

  await page
    .waitForLoadState("domcontentloaded", { timeout: timeoutMs })
    .catch(() => undefined);

  await page
    .waitForLoadState("networkidle", {
      timeout: Math.min(timeoutMs, fullPage ? 8000 : 4000),
    })
    .catch(() => undefined);

  await page
    .addStyleTag({
      content: `
        html {
          scroll-behavior: auto !important;
        }

        *, *::before, *::after {
          caret-color: transparent !important;
        }
      `,
    })
    .catch(() => undefined);

  if (!fullPage) {
    await page
      .evaluate(async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        window.scrollTo(0, 0);
        await sleep(700);
      })
      .catch(() => undefined);

    console.log("[processor] viewport page prepared");
    return;
  }

  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const getPageHeight = () =>
      Math.max(
        document.body?.scrollHeight || 0,
        document.body?.offsetHeight || 0,
        document.documentElement?.clientHeight || 0,
        document.documentElement?.scrollHeight || 0,
        document.documentElement?.offsetHeight || 0
      );

    const viewportHeight = window.innerHeight || 900;
    let totalHeight = getPageHeight();

    let y = 0;
    const step = Math.max(300, Math.floor(viewportHeight * 0.75));

    while (y < totalHeight) {
      window.scrollTo(0, y);
      await sleep(350);

      y += step;
      totalHeight = getPageHeight();
    }

    window.scrollTo(0, totalHeight);
    await sleep(700);

    window.scrollTo(0, 0);
    await sleep(1000);
  });

  await page.waitForTimeout(1000);
  console.log("[processor] dynamic page prepared");
}

async function capturePreview(browser, url, options) {
  const { timeoutMs, width, height, fullPage, quality, maxWebpHeight, label } = options;
  const safeUrl = await resolveSafeUrl(url);

  const page = await browser.newPage({
    viewport: { width, height },
    userAgent: "Nyabag bookmark preview bot",
  });

  try {
    await page.route("**/*", async (route) => {
      try {
        await assertSafeUrl(route.request().url());
        await route.continue();
      } catch {
        await route.abort();
      }
    });

    console.log(`[processor] ${label} screenshot started: ${safeUrl}`);

    await page.goto(safeUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });

    await preparePageForScreenshot(page, timeoutMs, fullPage);
    const observed = await extractDomDesignData(page, safeUrl);
    const deterministicVisualFacts = await extractVisualFacts(page, safeUrl);

    const png = await page.screenshot({
      type: "png",
      fullPage,
      timeout: timeoutMs,
    });

    console.log(`[processor] ${label} screenshot completed`);

    const webp = await sharp(png, {
      animated: false,
      limitInputPixels: 300_000_000,
    })
      .rotate()
      .resize({
        width: 1200,
        height: maxWebpHeight,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({
        quality,
        effort: 5,
        smartSubsample: true,
      })
      .toBuffer();

    console.log(`[processor] ${label} compression completed`);

    const screenshotPalette = await extractPaletteFromImage(webp);
    const metadata = await extractMetadata(page, safeUrl);
    const fonts = observed.typography.fontCandidates?.length
      ? observed.typography.fontCandidates
      : metadata.fonts;

    return {
      webp,
      metadata: {
        ...metadata,
        fonts,
        palette: screenshotPalette,
      },
      observed: {
        ...observed,
        colors: {
          ...observed.colors,
          screenshotPalette,
        },
        screenshot: {
          mimeType: "image/webp",
          palette: screenshotPalette,
          capturedAt: nowIso(),
        },
      },
      deterministicVisualFacts,
      resolvedUrl: safeUrl,
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function uploadScreenshot(supabase, path, webp) {
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, webp, {
      cacheControl: "31536000",
      contentType: "image/webp",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function updateBookmarkNormalScreenshot(supabase, job, capture, screenshotPath, screenshotUrl) {
  const fallbackTitle = getDomain(job.url) || job.url;

  const { data: existingBookmark, error: existingBookmarkError } = await supabase
    .from("bookmarks")
    .select("tags")
    .eq("id", job.bookmark_id)
    .eq("user_id", job.user_id)
    .eq("url", job.url)
    .maybeSingle();

  if (existingBookmarkError) {
    throw new Error(`Could not read bookmark tags: ${existingBookmarkError.message}`);
  }

  const { data: updatedBookmark, error: bookmarkError } = await supabase
    .from("bookmarks")
    .update({
      title: capture.metadata.title || fallbackTitle,
      summary: capture.metadata.summary,
      tags: mergeTags(existingBookmark?.tags, capture.metadata.tags),
      palette: capture.metadata.palette?.length ? capture.metadata.palette : fallbackPalette(job.url),
      fonts: capture.metadata.fonts,
      screenshot_url: screenshotUrl,
      screenshot_path: screenshotPath,
      screenshot_refreshed_at: capture.metadata.refreshedAt,
      metadata_refreshed_at: capture.metadata.refreshedAt,
      processing_status: "processing",
      processing_error: null,
      url: capture.resolvedUrl,
    })
    .eq("id", job.bookmark_id)
    .eq("user_id", job.user_id)
    .eq("url", job.url)
    .select("id")
    .maybeSingle();

  if (bookmarkError) {
    throw new Error(`Could not update normal bookmark screenshot: ${bookmarkError.message}`);
  }

  if (!updatedBookmark) {
    throw new Error("Bookmark URL changed before normal screenshot completed");
  }
}

async function markJobReady(supabase, job, screenshots, longCapture) {
  const fallbackTitle = getDomain(job.url) || job.url;

  const { data: existingBookmark, error: existingBookmarkError } = await supabase
    .from("bookmarks")
    .select("tags")
    .eq("id", job.bookmark_id)
    .eq("user_id", job.user_id)
    .eq("url", longCapture.resolvedUrl)
    .maybeSingle();

  if (existingBookmarkError) {
    throw new Error(`Could not read bookmark tags: ${existingBookmarkError.message}`);
  }

  const { data: updatedBookmark, error: bookmarkError } = await supabase
    .from("bookmarks")
    .update({
      title: longCapture.metadata.title || fallbackTitle,
      summary: longCapture.metadata.summary,
      tags: mergeTags(existingBookmark?.tags, longCapture.metadata.tags),
      palette: longCapture.metadata.palette?.length ? longCapture.metadata.palette : fallbackPalette(job.url),
      fonts: longCapture.metadata.fonts,
      screenshot_url: screenshots.normalUrl,
      screenshot_path: screenshots.normalPath,
      screenshot_refreshed_at: screenshots.normalRefreshedAt,
      long_screenshot_url: screenshots.longUrl,
      long_screenshot_path: screenshots.longPath,
      long_screenshot_refreshed_at: longCapture.metadata.refreshedAt,
      metadata_refreshed_at: longCapture.metadata.refreshedAt,
      processing_status: "ready",
      processing_error: null,
      url: longCapture.resolvedUrl,
      enrichment_finished_at: nowIso(),
    })
    .eq("id", job.bookmark_id)
    .eq("user_id", job.user_id)
    .eq("url", longCapture.resolvedUrl)
    .select("id")
    .maybeSingle();

  if (bookmarkError) {
    throw new Error(`Could not update bookmark: ${bookmarkError.message}`);
  }

  if (!updatedBookmark) {
    throw new Error("Bookmark URL changed before processing completed");
  }

  const { error: jobError } = await supabase
    .from("bookmark_processing_jobs")
    .update({
      status: "ready",
      error_message: null,
      locked_at: null,
      locked_by: null,
    })
    .eq("id", job.id);

  if (jobError) {
    throw new Error(`Could not mark job ready: ${jobError.message}`);
  }
}

async function markJobFailed(supabase, job, error) {
  const message =
    error instanceof Error ? error.message : "Bookmark processing failed";

  const safeMessage = message.slice(0, 1000);
  const shouldRetry = job.attempts < job.max_attempts;
  const backoffMinutes = Math.min(8, 2 ** Math.max(1, job.attempts));
  const runAfter = new Date(Date.now() + backoffMinutes * 60_000).toISOString();

  if (shouldRetry) {
    await supabase
      .from("bookmark_processing_jobs")
      .update({
        status: "queued",
        error_message: safeMessage,
        locked_at: null,
        locked_by: null,
        run_after: runAfter,
      })
      .eq("id", job.id);

    await supabase
      .from("bookmarks")
      .update({
        processing_status: "queued",
        processing_error: safeMessage,
      })
      .eq("id", job.bookmark_id)
      .eq("user_id", job.user_id)
      .eq("url", job.url);

    console.log(`[processor] job retry queued: ${job.id}`);
    return;
  }

  await supabase
    .from("bookmark_processing_jobs")
    .update({
      status: "failed",
      error_message: safeMessage,
      locked_at: null,
      locked_by: null,
    })
    .eq("id", job.id);

  await supabase
    .from("bookmarks")
    .update({
      processing_status: "failed",
      processing_error: safeMessage,
      enrichment_finished_at: nowIso(),
    })
    .eq("id", job.bookmark_id)
    .eq("user_id", job.user_id)
    .eq("url", job.url);

  console.log(`[processor] job failed: ${job.id}`);
}

async function processJob(supabase, browser, job, config) {
  console.log(`[processor] job claimed: ${job.id}`);

  await updateBookmarkProcessing(supabase, job);

  const normalCapture = await capturePreview(browser, job.url, config.normal);
  const normalPath = `${job.user_id}/${job.bookmark_id}/screenshot-${Date.now()}.webp`;
  const normalUrl = await uploadScreenshot(supabase, normalPath, normalCapture.webp);

  console.log("[processor] normal screenshot uploaded");

  await updateBookmarkNormalScreenshot(supabase, job, normalCapture, normalPath, normalUrl);

  console.log(`[processor] normal preview ready for onboarding: ${job.id}`);

  let longCapture;
  let longPath;
  let longUrl;

  try {
    longCapture = await capturePreview(browser, normalCapture.resolvedUrl, config.long);
    longPath = `${job.user_id}/${job.bookmark_id}/long-screenshot-${Date.now()}.webp`;
    longUrl = await uploadScreenshot(supabase, longPath, longCapture.webp);

    console.log("[processor] long screenshot uploaded");

    await markJobReady(
      supabase,
      job,
      {
        normalPath,
        normalUrl,
        normalRefreshedAt: normalCapture.metadata.refreshedAt,
        longPath,
        longUrl,
      },
      longCapture
    );

    console.log(`[processor] job ready: ${job.id}`);
  } catch (error) {
    console.error(
      `[processor] long screenshot error: ${job.id}`,
      error instanceof Error ? error.message : error
    );
    await markJobFailedAfterNormalScreenshot(
      supabase,
      job,
      error,
      normalCapture.resolvedUrl
    );
    return;
  }

  let bookmarkForVisualFacts = null;

  try {
    const { data: bookmarkForAi, error: bookmarkForAiError } = await supabase
      .from("bookmarks")
      .select("*")
      .eq("id", job.bookmark_id)
      .eq("user_id", job.user_id)
      .maybeSingle();

    if (bookmarkForAiError) {
      throw new Error(`Could not read bookmark for AI: ${bookmarkForAiError.message}`);
    }

    if (!bookmarkForAi) {
      throw new Error("Bookmark disappeared before AI analysis");
    }

    bookmarkForVisualFacts = bookmarkForAi;

    const aiMetadata = await analyzeBookmarkScreenshot({
      supabase,
      job,
      bookmark: bookmarkForAi,
      screenshot: longCapture.webp,
      observed: longCapture.observed,
    });

    if (aiMetadata?.suggested_tags?.length) {
      const { data: bookmarkTags } = await supabase
        .from("bookmarks")
        .select("tags")
        .eq("id", job.bookmark_id)
        .eq("user_id", job.user_id)
        .maybeSingle();

      await supabase
        .from("bookmarks")
        .update({ tags: mergeTags(bookmarkTags?.tags, aiMetadata.suggested_tags) })
        .eq("id", job.bookmark_id)
        .eq("user_id", job.user_id);
    }

    if (aiMetadata) console.log(`[processor] AI metadata ready: ${job.id}`);
  } catch (error) {
    console.error(
      `[processor] AI metadata failed: ${job.id}`,
      error instanceof Error ? error.message : error
    );
    await upsertAiFailed(supabase, job, error);
  }

  try {
    if (!bookmarkForVisualFacts) {
      const { data: bookmarkForVisualFactsResult, error: bookmarkForVisualFactsError } = await supabase
        .from("bookmarks")
        .select("*")
        .eq("id", job.bookmark_id)
        .eq("user_id", job.user_id)
        .maybeSingle();

      if (bookmarkForVisualFactsError) {
        throw new Error(`Could not read bookmark for visual facts: ${bookmarkForVisualFactsError.message}`);
      }
      if (!bookmarkForVisualFactsResult) throw new Error("Bookmark disappeared before visual facts");
      bookmarkForVisualFacts = bookmarkForVisualFactsResult;
    }

    let aiVisualFacts = null;
    try {
      aiVisualFacts = await enrichVisualFactsWithAi({
        bookmark: bookmarkForVisualFacts,
        screenshot: longCapture.webp,
        deterministic: longCapture.deterministicVisualFacts,
      });
    } catch (error) {
      console.warn(
        `[processor] visual facts AI enrichment skipped: ${job.id}`,
        error instanceof Error ? error.message : error
      );
    }

    const mergedVisualFacts = mergeVisualFacts(
      longCapture.deterministicVisualFacts,
      aiVisualFacts
    );
    await upsertVisualFacts(
      supabase,
      job,
      mergedVisualFacts,
      longCapture.deterministicVisualFacts.snapshot,
      aiVisualFacts
    );

    console.log(`[processor] visual facts ready: ${job.id}`);
  } catch (error) {
    console.error(
      `[processor] visual facts failed: ${job.id}`,
      error instanceof Error ? error.message : error
    );
    await upsertVisualFacts(
      supabase,
      job,
      null,
      longCapture.deterministicVisualFacts?.snapshot ?? {},
      null,
      error instanceof Error ? error.message : String(error)
    ).catch((upsertError) => {
      console.warn(
        `[processor] could not mark visual facts failed: ${job.id}`,
        upsertError instanceof Error ? upsertError.message : upsertError
      );
    });
  }
}

async function markJobFailedAfterNormalScreenshot(supabase, job, error, resolvedUrl) {
  const message =
    error instanceof Error ? error.message : "Long screenshot processing failed";

  const safeMessage = message.slice(0, 1000);

  await supabase
    .from("bookmark_processing_jobs")
    .update({
      status: "failed",
      error_message: safeMessage,
      locked_at: null,
      locked_by: null,
    })
    .eq("id", job.id);

  await supabase
    .from("bookmarks")
    .update({
      processing_status: "failed",
      processing_error: safeMessage,
      enrichment_finished_at: nowIso(),
    })
    .eq("id", job.bookmark_id)
    .eq("user_id", job.user_id)
    .eq("url", resolvedUrl);

  console.log(`[processor] long screenshot failed after normal preview: ${job.id}`);
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const timeoutMs = envNumber("SCREENSHOT_TIMEOUT_MS", 15_000);
  const width = envNumber("SCREENSHOT_WIDTH", 1440);
  const height = envNumber("SCREENSHOT_HEIGHT", 900);
  const quality = envNumber("WEBP_QUALITY", 76);
  const config = {
    maxJobs: envNumber("MAX_JOBS_PER_RUN", 5),
    normal: {
      label: "normal",
      timeoutMs,
      width,
      height,
      fullPage: false,
      quality,
      maxWebpHeight: envNumber("MAX_WEBP_HEIGHT", 900),
    },
    long: {
      label: "long",
      timeoutMs,
      width,
      height: envNumber("LONG_SCREENSHOT_HEIGHT", height),
      fullPage: true,
      quality,
      maxWebpHeight: envNumber("LONG_SCREENSHOT_MAX_WEBP_HEIGHT", 4000),
    },
  };
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
  const geminiModel = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";

  const workerId =
    process.env.WORKER_ID ||
    process.env.GITHUB_RUN_ID ||
    `local-${Date.now()}`;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  realtime: {
    transport: ws,
  },
});

  console.log("[processor] config", {
    maxJobs: config.maxJobs,
    normal: {
      timeoutMs: config.normal.timeoutMs,
      width: config.normal.width,
      height: config.normal.height,
      fullPage: config.normal.fullPage,
      maxWebpHeight: config.normal.maxWebpHeight,
    },
    long: {
      timeoutMs: config.long.timeoutMs,
      width: config.long.width,
      height: config.long.height,
      fullPage: config.long.fullPage,
      maxWebpHeight: config.long.maxWebpHeight,
    },
    quality,
    geminiConfigured,
    geminiModel,
    workerId,
  });

  if (!geminiConfigured) {
    console.warn(
      "[processor] Gemini is not configured; AI metadata will be skipped"
    );
  }

  const browser = await chromium.launch({
    headless: true,
  });

  try {
    for (let index = 0; index < config.maxJobs; index += 1) {
      const job = await claimJob(supabase, workerId);

      if (!job) {
        console.log("[processor] no queued jobs");
        break;
      }

      try {
        await processJob(supabase, browser, job, config);
      } catch (error) {
        console.error(
          `[processor] job error: ${job.id}`,
          error instanceof Error ? error.message : error
        );

        await markJobFailed(supabase, job, error);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(
    "[processor] fatal error:",
    error instanceof Error ? error.message : error
  );

  process.exitCode = 1;
});

import { DESIGN_DB, FALLBACK_PALETTES, TAG_COLORS } from "./content-colors";

export { DESIGN_DB, TAG_COLORS };

const FALLBACK_FONTS = [
  ["Inter", "Georgia"],
  ["Roboto", "Playfair Display"],
  ["Poppins", "Lora"],
  ["Lato", "Merriweather"],
  ["Nunito", "Source Serif Pro"],
  ["Outfit", "DM Serif Display"],
  ["Plus Jakarta Sans", "EB Garamond"],
];

export const SCREENSHOT_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "";
  }
}

export function getDesignData(url: string): { palette: string[]; fonts: string[] } {
  return {
    palette: [],
    fonts: [],
  };
}

export function isScreenshotStale(refreshedAt: string | null | undefined): boolean {
  if (!refreshedAt) return true;
  const refreshedTime = new Date(refreshedAt).getTime();
  if (!Number.isFinite(refreshedTime)) return true;
  return Date.now() - refreshedTime >= SCREENSHOT_REFRESH_INTERVAL_MS;
}

export function getTagColor(tag: string): string {
  const seed = tag.split("").reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return TAG_COLORS[seed % TAG_COLORS.length];
}

export function getFaviconUrl(url: string): string | null {
  try {
    return `/api/favicon?url=${encodeURIComponent(url)}`;
  } catch {
    return null;
  }
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

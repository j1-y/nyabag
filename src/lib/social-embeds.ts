export type SocialProvider = "x" | "facebook" | "linkedin" | "instagram" | "tiktok" | "pinterest";
export const SOCIAL_NOTE_PREFIX = "nyabag-social:";

export type SocialEmbed = { provider: SocialProvider; url: string };

export type SocialEmbedSize = {
  width: number;
  height: number;
};

export const SOCIAL_EMBED_SIZE: Record<SocialProvider, SocialEmbedSize> = {
  x: { width: 550, height: 640 },
  facebook: { width: 550, height: 650 },
  linkedin: { width: 550, height: 780 },
  instagram: { width: 540, height: 720 },
  tiktok: { width: 325, height: 580 },
  pinterest: { width: 345, height: 660 },
};

function normalizedUrl(raw: string): URL | null {
  const value = raw.trim();
  if (!value) return null;

  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
}

export function isSocialNoteContent(content: string): boolean {
  return content === SOCIAL_NOTE_PREFIX || content.startsWith(SOCIAL_NOTE_PREFIX);
}

export function getSocialNoteUrl(content: string): string {
  return isSocialNoteContent(content) ? content.slice(SOCIAL_NOTE_PREFIX.length) : content;
}

export function toSocialNoteContent(url: string): string {
  return `${SOCIAL_NOTE_PREFIX}${url}`;
}

export function parseSocialEmbed(raw: string): SocialEmbed | null {
  const url = normalizedUrl(getSocialNoteUrl(raw));
  if (!url) return null;

  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  const href = url.toString();

  if (hostname === "x.com" || hostname === "twitter.com" || hostname === "mobile.twitter.com") {
    return { provider: "x", url: href.replace("https://x.com/", "https://twitter.com/").replace("https://mobile.twitter.com/", "https://twitter.com/") };
  }

  if (hostname === "facebook.com" || hostname.endsWith(".facebook.com") || hostname === "fb.watch") {
    return { provider: "facebook", url: href };
  }

  if (hostname === "linkedin.com" || hostname.endsWith(".linkedin.com")) {
    return { provider: "linkedin", url: href };
  }

  if (hostname === "instagram.com" || hostname.endsWith(".instagram.com")) {
    return { provider: "instagram", url: href };
  }

  if (hostname === "tiktok.com" || hostname.endsWith(".tiktok.com")) {
    return { provider: "tiktok", url: href };
  }

  if (hostname === "pinterest.com" || hostname.endsWith(".pinterest.com") || hostname === "pin.it") {
    return { provider: "pinterest", url: href };
  }

  return null;
}

export function socialProviderLabel(provider: SocialProvider): string {
  switch (provider) {
    case "x":
      return "X / Twitter";
    case "facebook":
      return "Facebook";
    case "linkedin":
      return "LinkedIn";
    case "instagram":
      return "Instagram";
    case "tiktok":
      return "TikTok";
    case "pinterest":
      return "Pinterest";
  }
}

export function getSocialEmbedFallbackSize(provider: SocialProvider): SocialEmbedSize {
  return SOCIAL_EMBED_SIZE[provider];
}

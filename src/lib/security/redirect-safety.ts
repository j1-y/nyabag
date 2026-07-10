export function getSafeInternalPath(
  value: string | null | undefined,
  fallback = "/"
) {
  if (!value) return fallback;

  try {
    const decoded = decodeURIComponent(value.trim());

    if (!decoded.startsWith("/")) return fallback;
    if (decoded.startsWith("//")) return fallback;
    if (decoded.includes("\\\\")) return fallback;

    const parsed = new URL(decoded, "https://nyabag.local");
    if (parsed.origin !== "https://nyabag.local") return fallback;
    if (parsed.pathname.includes("://")) return fallback;

    const blockedPrefixes = ["/login", "/signup"];

    if (blockedPrefixes.some((prefix) => parsed.pathname === prefix)) {
      return fallback;
    }

    return decoded;
  } catch {
    return fallback;
  }
}

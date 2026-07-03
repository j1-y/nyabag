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
    if (decoded.includes("://")) return fallback;

    const blockedPrefixes = ["/login", "/signup"];

    if (blockedPrefixes.some((prefix) => decoded === prefix || decoded.startsWith(`${prefix}?`))) {
      return fallback;
    }

    return decoded;
  } catch {
    return fallback;
  }
}
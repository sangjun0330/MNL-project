export function sanitizeInternalPath(value: string | null | undefined, fallback = "/") {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (raw.includes("://")) return fallback;
  return raw;
}

export function withReturnTo(path: string, returnTo: string | null | undefined) {
  const safePath = sanitizeInternalPath(path, "/");
  const safeReturnTo = sanitizeInternalPath(returnTo, "");
  if (!safeReturnTo) return safePath;
  const separator = safePath.includes("?") ? "&" : "?";
  return `${safePath}${separator}returnTo=${encodeURIComponent(safeReturnTo)}`;
}

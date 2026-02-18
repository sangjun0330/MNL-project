const SCOPE_STORAGE_KEY = "wnl:handoff:scope";
const DEFAULT_SCOPE = "anon";
const HANDOFF_ROOT_PREFIX = "wnl:handoff";

const LEGACY_PREFIXES = [
  "wnl:handoff:raw:",
  "wnl:handoff:raw:index",
  "wnl:handoff:key:",
  "wnl:handoff:structured:",
  "wnl:handoff:structured:index",
  "wnl:handoff:draft:meta",
  "wnl:handoff:keystore:",
];

declare global {
  interface Window {
    __wnlHandoffScope?: string;
  }
}

function normalizeScope(scope: string | null | undefined) {
  if (!scope) return DEFAULT_SCOPE;
  const normalized = scope.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  if (!normalized) return DEFAULT_SCOPE;
  return normalized.slice(0, 80);
}

export function setHandoffStorageScope(scope: string | null | undefined) {
  if (typeof window === "undefined") return;
  const normalized = normalizeScope(scope);
  window.__wnlHandoffScope = normalized;
  try {
    window.localStorage.setItem(SCOPE_STORAGE_KEY, normalized);
  } catch {
    // noop
  }
}

export function getHandoffStorageScope() {
  if (typeof window === "undefined") return DEFAULT_SCOPE;

  const inMemory = normalizeScope(window.__wnlHandoffScope);
  if (inMemory !== DEFAULT_SCOPE || window.__wnlHandoffScope) {
    return inMemory;
  }

  try {
    const stored = window.localStorage.getItem(SCOPE_STORAGE_KEY);
    const normalized = normalizeScope(stored);
    window.__wnlHandoffScope = normalized;
    return normalized;
  } catch {
    return DEFAULT_SCOPE;
  }
}

export function handoffScopedKey(suffix: string) {
  return `${HANDOFF_ROOT_PREFIX}:${getHandoffStorageScope()}:${suffix}`;
}

export function handoffScopedPrefix(suffix: string) {
  return `${handoffScopedKey(suffix)}:`;
}

function matchesPrefix(key: string, prefixes: string[]) {
  return prefixes.some((prefix) => key === prefix || key.startsWith(prefix));
}

export function purgeHandoffLocalScope(options?: { includeLegacy?: boolean }) {
  if (typeof window === "undefined") return 0;
  const scope = getHandoffStorageScope();
  const scopedPrefix = `${HANDOFF_ROOT_PREFIX}:${scope}:`;
  const prefixes = options?.includeLegacy ? [scopedPrefix, ...LEGACY_PREFIXES] : [scopedPrefix];

  let removed = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      keys.push(key);
    }

    keys.forEach((key) => {
      if (!matchesPrefix(key, prefixes)) return;
      window.localStorage.removeItem(key);
      removed += 1;
    });
  } catch {
    return removed;
  }

  return removed;
}

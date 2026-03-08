"use client";

type SocialClientCacheEntry<T> = {
  data: T;
  updatedAt: number;
};

const STORAGE_PREFIX = "rnest-social-cache:";
const memoryCache = new Map<string, SocialClientCacheEntry<unknown>>();

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function storageKey(key: string) {
  return `${STORAGE_PREFIX}${key}`;
}

function readFromStorage<T>(key: string): SocialClientCacheEntry<T> | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SocialClientCacheEntry<T>;
    if (!parsed || typeof parsed.updatedAt !== "number" || !("data" in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildSocialClientCacheKey(userId: string, scope: string, suffix?: string) {
  return suffix ? `${userId}:${scope}:${suffix}` : `${userId}:${scope}`;
}

export function getSocialClientCache<T>(key: string): SocialClientCacheEntry<T> | null {
  const fromMemory = memoryCache.get(key) as SocialClientCacheEntry<T> | undefined;
  if (fromMemory) return fromMemory;

  const fromStorage = readFromStorage<T>(key);
  if (fromStorage) {
    memoryCache.set(key, fromStorage as SocialClientCacheEntry<unknown>);
    return fromStorage;
  }

  return null;
}

export function setSocialClientCache<T>(key: string, data: T) {
  const entry: SocialClientCacheEntry<T> = {
    data,
    updatedAt: Date.now(),
  };
  memoryCache.set(key, entry as SocialClientCacheEntry<unknown>);

  if (canUseStorage()) {
    try {
      window.sessionStorage.setItem(storageKey(key), JSON.stringify(entry));
    } catch {
      // Ignore storage quota/private mode failures and keep memory cache only.
    }
  }

  return entry;
}

export function clearSocialClientCache(key: string) {
  memoryCache.delete(key);
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.removeItem(storageKey(key));
  } catch {
    // Ignore storage failures.
  }
}

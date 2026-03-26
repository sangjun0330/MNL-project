"use client";

export type ClientCacheEntry<T> = {
  data: T;
  updatedAt: number;
};

const STORAGE_PREFIX = "rnest-client-cache:";
const memoryCache = new Map<string, ClientCacheEntry<unknown>>();

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function storageKey(key: string) {
  return `${STORAGE_PREFIX}${key}`;
}

function readFromStorage<T>(key: string): ClientCacheEntry<T> | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClientCacheEntry<T>;
    if (!parsed || typeof parsed.updatedAt !== "number" || !("data" in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getClientCache<T>(key: string): ClientCacheEntry<T> | null {
  const fromMemory = memoryCache.get(key) as ClientCacheEntry<T> | undefined;
  if (fromMemory) return fromMemory;

  const fromStorage = readFromStorage<T>(key);
  if (fromStorage) {
    memoryCache.set(key, fromStorage as ClientCacheEntry<unknown>);
    return fromStorage;
  }

  return null;
}

export function setClientCache<T>(key: string, data: T) {
  const entry: ClientCacheEntry<T> = {
    data,
    updatedAt: Date.now(),
  };
  memoryCache.set(key, entry as ClientCacheEntry<unknown>);

  if (canUseStorage()) {
    try {
      window.sessionStorage.setItem(storageKey(key), JSON.stringify(entry));
    } catch {
      // Ignore storage failures and keep memory cache only.
    }
  }

  return entry;
}

export function clearClientCache(key: string) {
  memoryCache.delete(key);
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.removeItem(storageKey(key));
  } catch {
    // Ignore storage failures.
  }
}

export function isClientCacheFresh(entry: ClientCacheEntry<unknown> | null | undefined, maxAgeMs: number) {
  if (!entry) return false;
  return Date.now() - entry.updatedAt <= maxAgeMs;
}

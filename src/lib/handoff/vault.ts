import { safeParse } from "../safeParse";
import { getHandoffSecureStore, type SecureStoreAdapter } from "./secureStore";
import { getHandoffStorageScope, handoffScopedKey, handoffScopedPrefix } from "./storageScope";
import type { RawSegment } from "./types";

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_RAW_TTL_MS = 24 * HOUR_MS;
const DEFAULT_VAULT_KEYSPACE = {
  rawPrefix: "wnl:handoff:raw:",
  rawIndexKey: "wnl:handoff:raw:index",
  keyPrefix: "wnl:handoff:key:",
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type VaultDeps = {
  storage: StorageLike;
  webCrypto: Crypto;
  secureStore?: SecureStoreAdapter;
  now?: () => number;
};

type EncryptedRawRecord = {
  sessionId: string;
  createdAt: number;
  expiresAt: number;
  ivBase64: string;
  cipherBase64: string;
};

type VaultKeyspace = {
  rawPrefix: string;
  rawIndexKey: string;
  keyPrefix: string;
};

function safeGetItem(storage: StorageLike, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(storage: StorageLike, key: string, value: string) {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemoveItem(storage: StorageLike, key: string) {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function bytesToBase64(bytes: Uint8Array) {
  if (typeof btoa === "function") {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  throw new Error("base64 encoder unavailable");
}

function base64ToBytes(base64: string) {
  if (typeof atob === "function") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }

  throw new Error("base64 decoder unavailable");
}

function readIndex(storage: StorageLike, keyspace: VaultKeyspace) {
  return safeParse<string[]>(safeGetItem(storage, keyspace.rawIndexKey), []);
}

function writeIndex(storage: StorageLike, keyspace: VaultKeyspace, ids: string[]) {
  return safeSetItem(storage, keyspace.rawIndexKey, JSON.stringify([...new Set(ids)]));
}

async function exportCryptoKey(webCrypto: Crypto, key: CryptoKey) {
  const raw = await webCrypto.subtle.exportKey("raw", key);
  return bytesToBase64(new Uint8Array(raw));
}

async function importCryptoKey(webCrypto: Crypto, base64: string) {
  const bytes = base64ToBytes(base64);
  return webCrypto.subtle.importKey(
    "raw",
    bytes,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
}

export function createHandoffVault(deps: VaultDeps, keyspace: VaultKeyspace = DEFAULT_VAULT_KEYSPACE) {
  const storage = deps.storage;
  const webCrypto = deps.webCrypto;
  const secureStore = deps.secureStore;
  const now = deps.now ?? Date.now;
  const keyRegistry = new Map<string, CryptoKey>();

  async function getSessionKey(sessionId: string, createIfMissing: boolean) {
    const existing = keyRegistry.get(sessionId);
    if (existing) return existing;

    if (secureStore) {
      const storedKeyBase64 = await secureStore.getItem(`${keyspace.keyPrefix}${sessionId}`);
      if (storedKeyBase64) {
        try {
          const imported = await importCryptoKey(webCrypto, storedKeyBase64);
          keyRegistry.set(sessionId, imported);
          return imported;
        } catch {
          await secureStore.removeItem(`${keyspace.keyPrefix}${sessionId}`);
        }
      }
    }

    if (!createIfMissing) return null;
    if (!webCrypto?.subtle) return null;

    const key = await webCrypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    keyRegistry.set(sessionId, key);

    if (secureStore) {
      try {
        const exported = await exportCryptoKey(webCrypto, key);
        await secureStore.setItem(`${keyspace.keyPrefix}${sessionId}`, exported);
      } catch {
        // secure store persistence failed; keep in-memory key only
      }
    }

    return key;
  }

  async function removeSessionKey(sessionId: string) {
    keyRegistry.delete(sessionId);
    if (!secureStore) return;
    try {
      await secureStore.removeItem(`${keyspace.keyPrefix}${sessionId}`);
    } catch {
      // noop
    }
  }

  return {
    async saveRawSegments(sessionId: string, segments: RawSegment[], ttlMs = DEFAULT_RAW_TTL_MS) {
      if (!webCrypto?.subtle) return false;

      const key = await getSessionKey(sessionId, true);
      if (!key) return false;

      const payloadBytes = new TextEncoder().encode(JSON.stringify({ segments }));
      const iv = webCrypto.getRandomValues(new Uint8Array(12));
      const encrypted = await webCrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, payloadBytes);

      const nowMs = now();
      const record: EncryptedRawRecord = {
        sessionId,
        createdAt: nowMs,
        expiresAt: nowMs + ttlMs,
        ivBase64: bytesToBase64(iv),
        cipherBase64: bytesToBase64(new Uint8Array(encrypted)),
      };

      const stored = safeSetItem(storage, `${keyspace.rawPrefix}${sessionId}`, JSON.stringify(record));
      if (!stored) return false;
      const index = readIndex(storage, keyspace);
      return writeIndex(storage, keyspace, [sessionId, ...index.filter((id) => id !== sessionId)]);
    },

    async loadRawSegments(sessionId: string): Promise<RawSegment[] | null> {
      if (!webCrypto?.subtle) return null;

      const recordRaw = safeGetItem(storage, `${keyspace.rawPrefix}${sessionId}`);
      const record = safeParse<EncryptedRawRecord | null>(recordRaw, null);
      if (!record) return null;

      if (record.expiresAt <= now()) {
        await this.cryptoShredSession(sessionId);
        return null;
      }

      const key = await getSessionKey(sessionId, false);
      if (!key) return null;

      try {
        const iv = base64ToBytes(record.ivBase64);
        const cipher = base64ToBytes(record.cipherBase64);
        const plainBuffer = await webCrypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
        const decoded = new TextDecoder().decode(plainBuffer);
        const parsed = safeParse<{ segments: RawSegment[] }>(decoded, { segments: [] });
        return parsed.segments;
      } catch {
        return null;
      }
    },

    async cryptoShredSession(sessionId: string) {
      safeRemoveItem(storage, `${keyspace.rawPrefix}${sessionId}`);
      const index = readIndex(storage, keyspace);
      writeIndex(storage, keyspace, index.filter((id) => id !== sessionId));
      await removeSessionKey(sessionId);
    },

    async purgeExpired() {
      const nowMs = now();
      const index = readIndex(storage, keyspace);
      const alive: string[] = [];
      let purged = 0;

      const deletions: Promise<void>[] = [];

      index.forEach((id) => {
        const raw = safeGetItem(storage, `${keyspace.rawPrefix}${id}`);
        const record = safeParse<EncryptedRawRecord | null>(raw, null);
        if (!record || record.expiresAt <= nowMs) {
          safeRemoveItem(storage, `${keyspace.rawPrefix}${id}`);
          deletions.push(removeSessionKey(id));
          purged += 1;
          return;
        }
        alive.push(id);
      });

      if (alive.length !== index.length) writeIndex(storage, keyspace, alive);
      if (deletions.length) await Promise.allSettled(deletions);
      return purged;
    },

    async purgeAll() {
      const index = readIndex(storage, keyspace);
      const unique = [...new Set(index)];
      unique.forEach((id) => {
        safeRemoveItem(storage, `${keyspace.rawPrefix}${id}`);
      });
      safeRemoveItem(storage, keyspace.rawIndexKey);
      await Promise.allSettled(unique.map((id) => removeSessionKey(id)));
      keyRegistry.clear();
      return unique.length;
    },

    isKeyLoaded(sessionId: string) {
      return keyRegistry.has(sessionId);
    },
  };
}

function createScopedVaultKeyspace(scope: string): VaultKeyspace {
  return {
    rawPrefix: handoffScopedPrefix("raw"),
    rawIndexKey: handoffScopedKey("raw:index"),
    keyPrefix: handoffScopedPrefix("key"),
  };
}

const browserVaultRegistry = new Map<string, ReturnType<typeof createHandoffVault>>();

function getBrowserVault() {
  if (typeof window === "undefined") return null;
  if (!window.localStorage || !window.crypto?.subtle) return null;

  const scope = getHandoffStorageScope();
  const existing = browserVaultRegistry.get(scope);
  if (existing) return existing;

  const created = createHandoffVault(
    {
      storage: window.localStorage,
      webCrypto: window.crypto,
      secureStore: getHandoffSecureStore(),
      now: Date.now,
    },
    createScopedVaultKeyspace(scope)
  );
  browserVaultRegistry.set(scope, created);
  return created;
}

export async function vaultSaveRawSegments(
  sessionId: string,
  segments: RawSegment[],
  ttlMs = DEFAULT_RAW_TTL_MS
) {
  const vault = getBrowserVault();
  if (!vault) return false;
  return vault.saveRawSegments(sessionId, segments, ttlMs);
}

export async function vaultLoadRawSegments(sessionId: string): Promise<RawSegment[] | null> {
  const vault = getBrowserVault();
  if (!vault) return null;
  return vault.loadRawSegments(sessionId);
}

export async function vaultCryptoShredSession(sessionId: string) {
  const vault = getBrowserVault();
  if (!vault) return;
  await vault.cryptoShredSession(sessionId);
}

export async function purgeExpiredVaultRecords() {
  const vault = getBrowserVault();
  if (!vault) return 0;
  return vault.purgeExpired();
}

export async function purgeAllVaultRecords() {
  const vault = getBrowserVault();
  if (!vault) return 0;
  return vault.purgeAll();
}

export function isVaultKeyLoaded(sessionId: string) {
  const vault = getBrowserVault();
  if (!vault) return false;
  return vault.isKeyLoaded(sessionId);
}

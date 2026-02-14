import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createHandoffVault } from "../vault";
import type { RawSegment } from "../types";

class MemoryStorage {
  private map = new Map<string, string>();

  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.map.set(key, value);
  }

  removeItem(key: string) {
    this.map.delete(key);
  }
}

class MemorySecureStore {
  private map = new Map<string, string>();

  async getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  async setItem(key: string, value: string) {
    this.map.set(key, value);
  }

  async removeItem(key: string) {
    this.map.delete(key);
  }
}

class ThrowingStorage {
  getItem(_key: string) {
    throw new Error("storage disabled");
    return null;
  }

  setItem(_key: string, _value: string) {
    throw new Error("storage disabled");
  }

  removeItem(_key: string) {
    throw new Error("storage disabled");
  }
}

const sampleSegments: RawSegment[] = [
  {
    segmentId: "seg-001",
    rawText: "701호 최OO 폐렴",
    startMs: 0,
    endMs: 5_000,
  },
];

test("createHandoffVault encrypts/decrypts raw segments and crypto-shreds keys", async () => {
  const storage = new MemoryStorage();
  const secureStore = new MemorySecureStore();
  let now = 1_700_000_000_000;

  const vault = createHandoffVault({
    storage,
    webCrypto: webcrypto as unknown as Crypto,
    secureStore,
    now: () => now,
  });

  const ok = await vault.saveRawSegments("session-1", sampleSegments, 60_000);
  assert.equal(ok, true);
  assert.equal(vault.isKeyLoaded("session-1"), true);

  const loaded = await vault.loadRawSegments("session-1");
  assert.deepEqual(loaded, sampleSegments);

  await vault.cryptoShredSession("session-1");
  assert.equal(vault.isKeyLoaded("session-1"), false);

  const afterShred = await vault.loadRawSegments("session-1");
  assert.equal(afterShred, null);

  now += 1000;
});

test("createHandoffVault purges expired records by TTL", async () => {
  const storage = new MemoryStorage();
  const secureStore = new MemorySecureStore();
  let now = 1_700_100_000_000;

  const vault = createHandoffVault({
    storage,
    webCrypto: webcrypto as unknown as Crypto,
    secureStore,
    now: () => now,
  });

  await vault.saveRawSegments("session-expire", sampleSegments, 1_000);
  const before = await vault.loadRawSegments("session-expire");
  assert.deepEqual(before, sampleSegments);

  now += 1_100;
  const purged = await vault.purgeExpired();
  assert.equal(purged, 1);

  const after = await vault.loadRawSegments("session-expire");
  assert.equal(after, null);
});

test("createHandoffVault can decrypt after restart when secure key store is available", async () => {
  const storage = new MemoryStorage();
  const secureStore = new MemorySecureStore();
  let now = 1_700_200_000_000;

  const vaultA = createHandoffVault({
    storage,
    webCrypto: webcrypto as unknown as Crypto,
    secureStore,
    now: () => now,
  });

  await vaultA.saveRawSegments("session-restart", sampleSegments, 60_000);
  const first = await vaultA.loadRawSegments("session-restart");
  assert.deepEqual(first, sampleSegments);

  const vaultB = createHandoffVault({
    storage,
    webCrypto: webcrypto as unknown as Crypto,
    secureStore,
    now: () => now,
  });

  const reloaded = await vaultB.loadRawSegments("session-restart");
  assert.deepEqual(reloaded, sampleSegments);
});

test("createHandoffVault fails closed when storage is unavailable", async () => {
  const storage = new ThrowingStorage();
  const secureStore = new MemorySecureStore();
  const vault = createHandoffVault({
    storage,
    webCrypto: webcrypto as unknown as Crypto,
    secureStore,
    now: () => 1_700_300_000_000,
  });

  const saved = await vault.saveRawSegments("session-fail", sampleSegments, 60_000);
  assert.equal(saved, false);

  const loaded = await vault.loadRawSegments("session-fail");
  assert.equal(loaded, null);

  await assert.doesNotReject(async () => {
    await vault.cryptoShredSession("session-fail");
  });
  await assert.doesNotReject(async () => {
    await vault.purgeExpired();
  });
});

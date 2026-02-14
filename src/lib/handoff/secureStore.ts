type SecureStoreAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

type CapacitorSecureStorePlugin = {
  set: (input: { key: string; value: string }) => Promise<void>;
  get: (input: { key: string }) => Promise<{ value: string | null }>;
  remove: (input: { key: string }) => Promise<void>;
};

const WEB_PREFIX = "wnl:handoff:keystore:";
const STRICT_PROFILE = "strict";

declare global {
  interface Window {
    __wnlHandoffSecureStoreMemory?: Record<string, string>;
  }
}

function getCapacitorSecureStorePlugin(): CapacitorSecureStorePlugin | null {
  if (typeof window === "undefined") return null;
  const plugin = (window as any)?.Capacitor?.Plugins?.HandoffSecureStore;
  if (!plugin) return null;
  if (typeof plugin.set !== "function" || typeof plugin.get !== "function" || typeof plugin.remove !== "function") {
    return null;
  }
  return plugin as CapacitorSecureStorePlugin;
}

function createWebFallbackStore(): SecureStoreAdapter {
  return {
    async getItem(key: string) {
      if (typeof window === "undefined") return null;
      try {
        return window.localStorage.getItem(`${WEB_PREFIX}${key}`);
      } catch {
        return null;
      }
    },
    async setItem(key: string, value: string) {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(`${WEB_PREFIX}${key}`, value);
      } catch {
        // noop
      }
    },
    async removeItem(key: string) {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.removeItem(`${WEB_PREFIX}${key}`);
      } catch {
        // noop
      }
    },
  };
}

function createMemoryFallbackStore(): SecureStoreAdapter {
  return {
    async getItem(key: string) {
      if (typeof window === "undefined") return null;
      const memory = window.__wnlHandoffSecureStoreMemory ?? {};
      return typeof memory[key] === "string" ? memory[key] : null;
    },
    async setItem(key: string, value: string) {
      if (typeof window === "undefined") return;
      const memory = window.__wnlHandoffSecureStoreMemory ?? {};
      memory[key] = value;
      window.__wnlHandoffSecureStoreMemory = memory;
    },
    async removeItem(key: string) {
      if (typeof window === "undefined") return;
      const memory = window.__wnlHandoffSecureStoreMemory ?? {};
      delete memory[key];
      window.__wnlHandoffSecureStoreMemory = memory;
    },
  };
}

function readPrivacyProfile() {
  return String(process.env.NEXT_PUBLIC_HANDOFF_PRIVACY_PROFILE ?? "").trim().toLowerCase();
}

export function getHandoffSecureStore(): SecureStoreAdapter {
  const plugin = getCapacitorSecureStorePlugin();
  if (!plugin) {
    // strict 웹 모드에서는 키를 디스크(localStorage)에 남기지 않는다.
    return readPrivacyProfile() === STRICT_PROFILE ? createMemoryFallbackStore() : createWebFallbackStore();
  }

  return {
    async getItem(key: string) {
      const result = await plugin.get({ key });
      return result?.value ?? null;
    },
    async setItem(key: string, value: string) {
      await plugin.set({ key, value });
    },
    async removeItem(key: string) {
      await plugin.remove({ key });
    },
  };
}

export type { SecureStoreAdapter };

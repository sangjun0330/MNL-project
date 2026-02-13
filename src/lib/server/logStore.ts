type DailyLogRow = {
  deviceId: string;
  date: string;
  payload: unknown;
  clientUpdatedAt: number;
  updatedAt: number;
};

const DISABLED_ERROR = "wnl_daily_logs_disabled_use_user_state";

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64url");
  }
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacBase64Url(secret: string, message: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("WebCrypto not available");
  }
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toBase64Url(new Uint8Array(sig));
}

export async function makeSignedToken(deviceId: string): Promise<string> {
  const secret = process.env.LOG_SIGNING_SECRET;
  if (!secret) return "";
  const issuedAt = Date.now();
  const base = `${deviceId}|${issuedAt}`;
  const sig = await hmacBase64Url(secret, base);
  return `${deviceId}.${issuedAt}.${sig}`;
}

export async function verifySignedToken(token: string | null, deviceId: string): Promise<boolean> {
  const secret = process.env.LOG_SIGNING_SECRET;
  if (!secret) return true;
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [did, issuedAtStr, sig] = parts;
  if (did !== deviceId) return false;
  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt)) return false;
  if (Date.now() - issuedAt > 90 * 24 * 60 * 60 * 1000) return false;
  const expected = await hmacBase64Url(secret, `${deviceId}|${issuedAt}`);
  return expected === sig;
}

export async function saveDailyLog(_input: {
  deviceId: string;
  date: string;
  payload: unknown;
  clientUpdatedAt: number;
}): Promise<void> {
  throw new Error(DISABLED_ERROR);
}

export async function listDailyLogs(_params: {
  deviceId?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<DailyLogRow[]> {
  throw new Error(DISABLED_ERROR);
}

import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

type DailyLogRow = {
  deviceId: string;
  date: string; // ISODate
  payload: any;
  clientUpdatedAt: number;
  updatedAt: number;
};

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
  if (!secret) return true; // 시크릿이 없으면 개발/로컬 환경: 검증 스킵
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [did, issuedAtStr, sig] = parts;
  if (did !== deviceId) return false;
  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt)) return false;
  if (Date.now() - issuedAt > 90 * 24 * 60 * 60 * 1000) return false;
  const base = `${deviceId}|${issuedAt}`;
  const expected = await hmacBase64Url(secret, base);
  return expected === sig;
}

async function saveToSupabase(row: DailyLogRow): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("wnl_daily_logs")
    .upsert(
      {
        device_id: row.deviceId,
        date_iso: row.date,
        payload: row.payload,
        client_updated_at: row.clientUpdatedAt,
        updated_at: new Date(row.updatedAt).toISOString(),
      },
      { onConflict: "device_id,date_iso" }
    );

  if (error) {
    throw error;
  }
}

async function listFromSupabase(params: {
  deviceId?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<DailyLogRow[]> {
  const admin = getSupabaseAdmin();
  let query = admin
    .from("wnl_daily_logs")
    .select("device_id, date_iso, payload, client_updated_at, updated_at");

  if (params.deviceId) query = query.eq("device_id", params.deviceId);
  if (params.from) query = query.gte("date_iso", params.from);
  if (params.to) query = query.lte("date_iso", params.to);

  const limit = Math.min(Math.max(params.limit ?? 200, 1), 1000);
  const { data, error } = await query.order("date_iso", { ascending: false }).limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((r: any) => ({
    deviceId: r.device_id,
    date: r.date_iso,
    payload: r.payload,
    clientUpdatedAt: Number(r.client_updated_at),
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
  }));
}

export async function saveDailyLog(input: {
  deviceId: string;
  date: string;
  payload: any;
  clientUpdatedAt: number;
}): Promise<void> {
  const row: DailyLogRow = {
    deviceId: input.deviceId,
    date: input.date,
    payload: input.payload,
    clientUpdatedAt: input.clientUpdatedAt,
    updatedAt: Date.now(),
  };

  await saveToSupabase(row);
}

export async function listDailyLogs(params: {
  deviceId?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<DailyLogRow[]> {
  return listFromSupabase(params);
}

import { createClient } from "@supabase/supabase-js";

type DailyLogRow = {
  deviceId: string;
  date: string; // ISODate
  payload: any;
  clientUpdatedAt: number;
  updatedAt: number;
};

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
  const g = globalThis as any;
  if (!g.__wnlSupabaseAdmin) {
    g.__wnlSupabaseAdmin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return g.__wnlSupabaseAdmin as ReturnType<typeof createClient>;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 =
    typeof btoa === "function"
      ? btoa(binary)
      : typeof Buffer !== "undefined"
      ? Buffer.from(binary, "binary").toString("base64")
      : "";
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacSha256(secret: string, data: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("crypto.subtle unavailable");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return base64Url(new Uint8Array(sig));
}

export async function makeSignedToken(deviceId: string): Promise<string> {
  const secret = process.env.LOG_SIGNING_SECRET;
  if (!secret) return "";
  const issuedAt = Date.now();
  const base = `${deviceId}|${issuedAt}`;
  const sig = await hmacSha256(secret, base);
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
  // 토큰 유효기간: 90일
  if (Date.now() - issuedAt > 90 * 24 * 60 * 60 * 1000) return false;
  const base = `${deviceId}|${issuedAt}`;
  const expected = await hmacSha256(secret, base);
  return expected === sig;
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
  const admin = getAdminClient();
  const { error } = await admin
    .from("wnl_daily_logs")
    .upsert(
      {
        device_id: row.deviceId,
        date_iso: row.date,
        payload: row.payload,
        client_updated_at: row.clientUpdatedAt,
      },
      { onConflict: "device_id,date_iso" }
    );
  if (error) throw new Error(error.message);
}

export async function listDailyLogs(params: {
  deviceId?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<DailyLogRow[]> {
  const admin = getAdminClient();
  let query = admin
    .from("wnl_daily_logs")
    .select("device_id,date_iso,payload,client_updated_at,updated_at");
  if (params.deviceId) query = query.eq("device_id", params.deviceId);
  if (params.from) query = query.gte("date_iso", params.from);
  if (params.to) query = query.lte("date_iso", params.to);
  const limit = Math.min(Math.max(params.limit ?? 200, 1), 1000);
  const { data, error } = await query.order("date_iso", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({
    deviceId: r.device_id,
    date: r.date_iso,
    payload: r.payload,
    clientUpdatedAt: Number(r.client_updated_at ?? 0),
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
  }));
}

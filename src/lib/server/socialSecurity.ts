import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

const encoder = new TextEncoder();
const INVISIBLE_UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200d\u2060\ufeff\u202a-\u202e\u2066-\u2069]/g;

function toBase64Url(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64url");
  }
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function cleanSocialNickname(value: unknown, maxLength = 12): string {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .replace(INVISIBLE_UNSAFE_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(normalized).slice(0, maxLength).join("");
}

export function readSocialActorIp(req: Request): string {
  const cfIp = String(req.headers.get("cf-connecting-ip") ?? "").trim();
  if (cfIp) return cfIp.slice(0, 80);

  const xff = String(req.headers.get("x-forwarded-for") ?? "").trim();
  if (!xff) return "";
  return xff.split(",")[0]?.trim().slice(0, 80) ?? "";
}

export function generateOpaqueToken(byteLength = 24): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return toBase64Url(new Uint8Array(digest));
}

export async function isSocialActionRateLimited(input: {
  req: Request;
  userId: string;
  action: string;
  maxPerUser: number;
  maxPerIp?: number;
  windowMinutes: number;
}): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const sinceIso = new Date(Date.now() - input.windowMinutes * 60_000).toISOString();

  const [{ count: userCount }, { count: ipCount }] = await Promise.all([
    (admin as any)
      .from("rnest_social_action_attempts")
      .select("id", { count: "exact", head: true })
      .eq("action", input.action)
      .eq("actor_user_id", input.userId)
      .gte("created_at", sinceIso),
    input.maxPerIp && readSocialActorIp(input.req)
      ? (admin as any)
          .from("rnest_social_action_attempts")
          .select("id", { count: "exact", head: true })
          .eq("action", input.action)
          .eq("actor_ip", readSocialActorIp(input.req))
          .gte("created_at", sinceIso)
      : Promise.resolve({ count: 0 }),
  ]);

  return Number(userCount ?? 0) >= input.maxPerUser || Number(ipCount ?? 0) >= Number(input.maxPerIp ?? Infinity);
}

export async function recordSocialActionAttempt(input: {
  req: Request;
  userId?: string | null;
  action: string;
  success: boolean;
  detail?: string;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  const actorIp = readSocialActorIp(input.req);

  try {
    await (admin as any).from("rnest_social_action_attempts").insert({
      action: input.action,
      actor_user_id: input.userId || null,
      actor_ip: actorIp || null,
      success: input.success,
      detail: String(input.detail ?? "").slice(0, 80),
    });
  } catch (err: any) {
    console.error("[SocialSecurity/recordAttempt] err=%s", String(err?.message ?? err));
  }
}

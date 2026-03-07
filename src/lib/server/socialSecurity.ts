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

function fromBase64Url(input: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(input, "base64url").toString("utf8");
  }
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4 || 4)) % 4);
  return decodeURIComponent(
    Array.from(atob(padded))
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join("")
  );
}

export function cleanSocialNickname(value: unknown, maxLength = 12): string {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .replace(INVISIBLE_UNSAFE_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(normalized).slice(0, maxLength).join("");
}

export function cleanStatusMessage(value: unknown): string {
  const raw = String(value ?? "")
    .replace(/<[^>]*>/g, "")           // HTML 태그 제거 (XSS 방지)
    .replace(INVISIBLE_UNSAFE_CHARS, "")
    .replace(/[\r\n\t]+/g, " ")        // 줄바꿈·탭 → 공백 (붙여넣기 방지)
    .replace(/\s+/g, " ")
    .trim();
  // Array.from() = grapheme-aware (대부분 emoji 안전, Edge 호환)
  return Array.from(raw).slice(0, 30).join("");
}

export function cleanSocialGroupName(value: unknown): string {
  return cleanSocialNickname(value, 20);
}

export function cleanSocialGroupDescription(value: unknown): string {
  const raw = String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(INVISIBLE_UNSAFE_CHARS, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(raw).slice(0, 80).join("");
}

export function cleanSocialGroupNotice(value: unknown): string {
  const raw = String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(INVISIBLE_UNSAFE_CHARS, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(raw).slice(0, 120).join("");
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

async function hmacBase64Url(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toBase64Url(new Uint8Array(signature));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function socialInviteSecret(): string {
  const secret =
    String(process.env.SOCIAL_INVITE_SIGNING_SECRET ?? "").trim() ||
    String(process.env.LOG_SIGNING_SECRET ?? "").trim() ||
    String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!secret) throw new Error("missing_social_invite_secret");
  return secret;
}

export type SocialInvitePayload = {
  inviterUserId: string;
  codeUpdatedAt: string;
  expiresAt: number;
};

export type SocialGroupInvitePayload = {
  groupId: number;
  inviterUserId: string;
  inviteVersion: number;
  expiresAt: number;
};

export async function signSocialInviteToken(payload: SocialInvitePayload): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = await hmacBase64Url(socialInviteSecret(), body);
  return `${body}.${sig}`;
}

export async function verifySocialInviteToken(token: string): Promise<SocialInvitePayload | null> {
  const [body, sig] = token.split(".", 2);
  if (!body || !sig) return null;

  const expected = await hmacBase64Url(socialInviteSecret(), body);
  if (!constantTimeEqual(expected, sig)) return null;

  try {
    const json = JSON.parse(fromBase64Url(body)) as Partial<SocialInvitePayload>;
    if (!json.inviterUserId || !json.codeUpdatedAt || !Number.isFinite(json.expiresAt)) return null;
    return {
      inviterUserId: String(json.inviterUserId),
      codeUpdatedAt: String(json.codeUpdatedAt),
      expiresAt: Number(json.expiresAt),
    };
  } catch {
    return null;
  }
}

export async function signSocialGroupInviteToken(payload: SocialGroupInvitePayload): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = await hmacBase64Url(socialInviteSecret(), body);
  return `${body}.${sig}`;
}

export async function verifySocialGroupInviteToken(token: string): Promise<SocialGroupInvitePayload | null> {
  const [body, sig] = token.split(".", 2);
  if (!body || !sig) return null;

  const expected = await hmacBase64Url(socialInviteSecret(), body);
  if (!constantTimeEqual(expected, sig)) return null;

  try {
    const json = JSON.parse(fromBase64Url(body)) as Partial<SocialGroupInvitePayload>;
    if (!Number.isFinite(json.groupId) || !json.inviterUserId || !Number.isFinite(json.inviteVersion) || !Number.isFinite(json.expiresAt)) {
      return null;
    }
    return {
      groupId: Number(json.groupId),
      inviterUserId: String(json.inviterUserId),
      inviteVersion: Number(json.inviteVersion),
      expiresAt: Number(json.expiresAt),
    };
  } catch {
    return null;
  }
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
  const actorIp = readSocialActorIp(input.req);

  try {
    const [{ count: userCount }, { count: ipCount }] = await Promise.all([
      (admin as any)
        .from("rnest_social_action_attempts")
        .select("id", { count: "exact", head: true })
        .eq("action", input.action)
        .eq("actor_user_id", input.userId)
        .gte("created_at", sinceIso),
      input.maxPerIp && actorIp
        ? (admin as any)
            .from("rnest_social_action_attempts")
            .select("id", { count: "exact", head: true })
            .eq("action", input.action)
            .eq("actor_ip", actorIp)
            .gte("created_at", sinceIso)
        : Promise.resolve({ count: 0 }),
    ]);

    return Number(userCount ?? 0) >= input.maxPerUser || Number(ipCount ?? 0) >= Number(input.maxPerIp ?? Infinity);
  } catch (err: any) {
    console.warn("[SocialSecurity/rateLimit] fail-open err=%s", String(err?.message ?? err));
    return false;
  }
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

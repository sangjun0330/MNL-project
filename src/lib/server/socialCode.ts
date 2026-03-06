import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type SocialCodeRecord = {
  code: string;
  createdAt: string;
  updatedAt: string;
  shareVersion: number;
};

function isMissingShareVersionSchemaError(err: unknown): boolean {
  const message = String((err as any)?.message ?? err ?? "").toLowerCase();
  return message.includes("share_version") || message.includes("column") && message.includes("rnest_connect_codes");
}

function generateCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CHARS[b % CHARS.length]).join("");
}

async function persistCode(userId: string, shareVersion: number, preferredCode?: string): Promise<SocialCodeRecord> {
  const admin = getSupabaseAdmin();
  const updatedAt = new Date().toISOString();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = attempt === 0 && preferredCode ? preferredCode : generateCode();
    let error: any = null;

    const nextRow = {
      user_id: userId,
      code,
      share_version: shareVersion,
      updated_at: updatedAt,
    };

    ({ error } = await (admin as any).from("rnest_connect_codes").upsert(nextRow));
    if (error && isMissingShareVersionSchemaError(error)) {
      ({ error } = await (admin as any)
        .from("rnest_connect_codes")
        .upsert({
          user_id: userId,
          code,
          updated_at: updatedAt,
        }));
    }

    if (!error) {
      return { code, createdAt: updatedAt, updatedAt, shareVersion };
    }
    if (!String(error?.message ?? "").toLowerCase().includes("unique")) {
      throw error;
    }
  }

  throw new Error("code_generation_failed");
}

export async function getSocialCode(userId: string): Promise<SocialCodeRecord | null> {
  const admin = getSupabaseAdmin();
  let data: any = null;
  let error: any = null;

  ({ data, error } = await (admin as any)
    .from("rnest_connect_codes")
    .select("code, created_at, updated_at, share_version")
    .eq("user_id", userId)
    .maybeSingle());

  if (error && isMissingShareVersionSchemaError(error)) {
    ({ data, error } = await (admin as any)
      .from("rnest_connect_codes")
      .select("code, created_at, updated_at")
      .eq("user_id", userId)
      .maybeSingle());
  }

  if (error) throw error;
  if (!data) return null;

  return {
    code: data.code,
    createdAt: data.created_at,
    updatedAt: data.updated_at ?? data.created_at,
    shareVersion: Number(data.share_version ?? 1),
  };
}

export async function getOrCreateSocialCode(userId: string): Promise<SocialCodeRecord> {
  const existing = await getSocialCode(userId);
  if (existing) return existing;
  return persistCode(userId, 1);
}

export async function regenerateSocialCode(userId: string): Promise<SocialCodeRecord> {
  const existing = await getSocialCode(userId);
  const shareVersion = existing ? existing.shareVersion + 1 : 1;
  return persistCode(userId, shareVersion);
}

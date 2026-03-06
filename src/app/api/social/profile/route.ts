import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function sanitize(v: unknown, max = 20): string {
  return String(v ?? "").trim().slice(0, max);
}

const ALLOWED_AVATARS = ["🐧", "🦊", "🐱", "🐻", "🦁", "🐺", "🦅", "🐬"];

// GET /api/social/profile — 내 소셜 프로필 조회
export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const admin = getSupabaseAdmin();
  try {
    const { data, error } = await (admin as any)
      .from("rnest_social_profiles")
      .select("nickname, avatar_emoji, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    return jsonNoStore({
      ok: true,
      data: data ? { nickname: data.nickname, avatarEmoji: data.avatar_emoji } : null,
    });
  } catch (err: any) {
    console.error("[SocialProfile/GET] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_get_profile" }, { status: 500 });
  }
}

// POST /api/social/profile — 닉네임/아바타 저장
export async function POST(req: Request) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const nickname = sanitize(body?.nickname, 12);
  const avatarEmoji = sanitize(body?.avatarEmoji, 4);

  if (!nickname) {
    return jsonNoStore({ ok: false, error: "nickname_required" }, { status: 400 });
  }
  if (!ALLOWED_AVATARS.includes(avatarEmoji)) {
    return jsonNoStore({ ok: false, error: "invalid_avatar" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  try {
    const { error } = await (admin as any).from("rnest_social_profiles").upsert({
      user_id: userId,
      nickname,
      avatar_emoji: avatarEmoji,
      updated_at: new Date().toISOString(),
    });

    if (error) throw error;
    return jsonNoStore({ ok: true, data: { nickname, avatarEmoji } });
  } catch (err: any) {
    console.error("[SocialProfile/POST] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_save_profile" }, { status: 500 });
  }
}

import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import {
  assertSocialReadAccess,
  assertSocialWriteAccess,
  getSocialAccessErrorCode,
} from "@/lib/server/socialAdmin";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  getOwnSocialProfile,
  saveSocialProfile,
} from "@/lib/server/socialHub";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// GET /api/social/profile — 내 소셜 프로필 조회
export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: true, data: null });

  const admin = getSupabaseAdmin();
  try {
    await assertSocialReadAccess(admin, userId);
    const profile = await getOwnSocialProfile(admin, userId);
    return jsonNoStore({ ok: true, data: profile });
  } catch (err: any) {
    const accessCode = getSocialAccessErrorCode(err);
    if (accessCode) return jsonNoStore({ ok: false, error: accessCode }, { status: 403 });
    console.error("[SocialProfile/GET] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_get_profile" }, { status: 500 });
  }
}

// POST /api/social/profile — 허브 프로필 저장
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

  const admin = getSupabaseAdmin();
  try {
    await assertSocialWriteAccess(admin, userId);
    const profile = await saveSocialProfile(admin, userId, {
      nickname: body?.nickname,
      avatarEmoji: body?.avatarEmoji,
      statusMessage: body?.statusMessage,
      displayName: body?.displayName,
      bio: body?.bio,
      handle: body?.handle,
      accountVisibility: body?.accountVisibility,
      discoverability: body?.discoverability,
      defaultPostVisibility: body?.defaultPostVisibility,
    });
    return jsonNoStore({ ok: true, data: profile });
  } catch (err: any) {
    const accessCode = getSocialAccessErrorCode(err);
    if (accessCode) return jsonNoStore({ ok: false, error: accessCode }, { status: 403 });
    if (err?.code === "nickname_required") {
      return jsonNoStore({ ok: false, error: "nickname_required" }, { status: 400 });
    }
    if (err?.code === "invalid_avatar") {
      return jsonNoStore({ ok: false, error: "invalid_avatar" }, { status: 400 });
    }
    if (err?.code === "display_name_required") {
      return jsonNoStore({ ok: false, error: "display_name_required" }, { status: 400 });
    }
    if (err?.code === "display_name_taken") {
      return jsonNoStore({ ok: false, error: "display_name_taken" }, { status: 409 });
    }
    if (err?.code === "nickname_taken") {
      return jsonNoStore({ ok: false, error: "nickname_taken" }, { status: 409 });
    }
    if (err?.code === "invalid_handle") {
      return jsonNoStore({ ok: false, error: "invalid_handle" }, { status: 400 });
    }
    if (err?.code === "handle_taken") {
      return jsonNoStore({ ok: false, error: "handle_taken" }, { status: 409 });
    }
    console.error("[SocialProfile/POST] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_save_profile" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getRouteSupabaseClient } from "@/lib/server/supabaseRouteClient";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";

export const runtime = "edge";
const DEFAULT_DELETE_REAUTH_MAX_AGE_SEC = 15 * 60;

function bad(status: number, message: string) {
  return jsonNoStore({ ok: false, error: message }, { status });
}

function extractBearerToken(req: Request): string | null {
  const header = String(req.headers.get("authorization") ?? "").trim();
  if (!header) return null;
  const [scheme, token] = header.split(" ", 2);
  if (!scheme || !token) return null;
  return scheme.toLowerCase() === "bearer" ? token : null;
}

function resolveDeleteReauthMaxAgeMs() {
  const raw = Number(process.env.ACCOUNT_DELETE_REAUTH_MAX_AGE_SEC ?? DEFAULT_DELETE_REAUTH_MAX_AGE_SEC);
  if (!Number.isFinite(raw)) return DEFAULT_DELETE_REAUTH_MAX_AGE_SEC * 1000;
  const seconds = Math.max(60, Math.min(24 * 60 * 60, Math.round(raw)));
  return seconds * 1000;
}

async function hasRecentLoginForDelete(req: Request, expectedUserId: string): Promise<boolean> {
  try {
    const supabase = await getRouteSupabaseClient();
    const bearer = extractBearerToken(req);
    const { data, error } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser();
    if (error || !data.user?.id) return false;
    if (data.user.id !== expectedUserId) return false;
    const lastSignInAtMs = Date.parse(String(data.user.last_sign_in_at ?? ""));
    if (!Number.isFinite(lastSignInAtMs) || lastSignInAtMs <= 0) return false;
    return Date.now() - lastSignInAtMs <= resolveDeleteReauthMaxAgeMs();
  } catch {
    return false;
  }
}

export async function DELETE(req: Request) {
  const sameOriginError = sameOriginRequestError(req);
  if (sameOriginError) return bad(403, sameOriginError);

  const userId = await readUserIdFromRequest(req);
  if (!userId) return bad(401, "Login required.");
  if (!(await hasRecentLoginForDelete(req, userId))) {
    return bad(401, "reauth_required_recent_login");
  }

  const admin = getSupabaseAdmin();

  try {
    // 1. ai_content (AI 회복 캐시)
    const aiContentDelete = await admin.from("ai_content").delete().eq("user_id", userId);
    if (aiContentDelete.error) {
      return bad(500, "failed_to_delete_account");
    }

    // 2. rnest_user_state (사용자 상태 데이터)
    const userStateDelete = await admin.from("rnest_user_state").delete().eq("user_id", userId);
    if (userStateDelete.error) {
      return bad(500, "failed_to_delete_account");
    }

    // 3. rnest_users (사용자 프로필)
    const usersDelete = await admin.from("rnest_users").delete().eq("user_id", userId);
    if (usersDelete.error) {
      return bad(500, "failed_to_delete_account");
    }

    // 4. Supabase Auth 유저 삭제
    const authDelete = await admin.auth.admin.deleteUser(userId);
    if (authDelete.error) {
      return bad(500, "failed_to_delete_account");
    }

    return jsonNoStore({ ok: true });
  } catch {
    return bad(500, "failed_to_delete_account");
  }
}

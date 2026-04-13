import { jsonNoStore } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  getSocialProfileHeaderByHandle,
  listFollowSummaries,
} from "@/lib/server/socialHub";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const { handle } = await params;
  const admin = getSupabaseAdmin();

  try {
    const profile = await getSocialProfileHeaderByHandle(admin, handle, userId);
    if (!profile) {
      return jsonNoStore({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (profile.isProfileLocked && !profile.relationship.isSelf) {
      return jsonNoStore({ ok: false, error: "profile_locked" }, { status: 403 });
    }

    const items = await listFollowSummaries(admin, profile.userId, "following");
    return jsonNoStore({ ok: true, data: { items } });
  } catch (err: any) {
    console.error("[SocialFollowing/GET] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_get_following" }, { status: 500 });
  }
}

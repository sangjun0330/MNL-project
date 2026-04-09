import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getSocialProfileHeaderByHandle, toggleFollow } from "@/lib/server/socialHub";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const { handle } = await params;
  const admin = getSupabaseAdmin();

  try {
    const profile = await getSocialProfileHeaderByHandle(admin, handle, userId);
    if (!profile) {
      return jsonNoStore({ ok: false, error: "not_found" }, { status: 404 });
    }

    const result = await toggleFollow(admin, userId, profile.userId);
    return jsonNoStore({ ok: true, data: result });
  } catch (err: any) {
    if (err?.code === "invalid_follow_target") {
      return jsonNoStore({ ok: false, error: "invalid_follow_target" }, { status: 400 });
    }
    console.error("[SocialFollow/POST] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_toggle_follow" }, { status: 500 });
  }
}

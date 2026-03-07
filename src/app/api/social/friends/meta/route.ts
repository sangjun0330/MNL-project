import { jsonNoStore } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// GET /api/social/friends/meta — 내 모든 friend_meta 조회
export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const admin = getSupabaseAdmin();

  try {
    const { data: rows, error } = await (admin as any)
      .from("rnest_social_friend_meta")
      .select("friend_id, pinned, alias, muted")
      .eq("owner_id", userId);

    if (error) throw error;

    const meta: Record<string, { pinned: boolean; alias: string; muted: boolean }> = {};
    for (const r of rows ?? []) {
      meta[r.friend_id] = {
        pinned: r.pinned ?? false,
        alias: r.alias ?? "",
        muted: r.muted ?? false,
      };
    }

    return jsonNoStore({ ok: true, data: meta });
  } catch (err: any) {
    console.error("[SocialFriendsMeta/GET] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_get_friend_meta" }, { status: 500 });
  }
}

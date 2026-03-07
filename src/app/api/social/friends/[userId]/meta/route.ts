import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { cleanSocialNickname } from "@/lib/server/socialSecurity";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// PATCH /api/social/friends/[userId]/meta — 핀/별칭/뮤트 부분 업데이트
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const ownerId = await readUserIdFromRequest(req);
  if (!ownerId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const { userId: friendId } = await params;
  if (!friendId || friendId === ownerId) {
    return jsonNoStore({ ok: false, error: "invalid_friend_id" }, { status: 400 });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    // 현재 값 조회
    const { data: current } = await (admin as any)
      .from("rnest_social_friend_meta")
      .select("pinned, alias, muted")
      .eq("owner_id", ownerId)
      .eq("friend_id", friendId)
      .maybeSingle();

    const currentPinned = current?.pinned ?? false;
    const currentAlias = current?.alias ?? "";
    const currentMuted = current?.muted ?? false;

    const newRow = {
      owner_id: ownerId,
      friend_id: friendId,
      pinned: typeof body?.pinned === "boolean" ? body.pinned : currentPinned,
      alias:
        typeof body?.alias === "string"
          ? cleanSocialNickname(body.alias, 12)
          : currentAlias,
      muted: typeof body?.muted === "boolean" ? body.muted : currentMuted,
      updated_at: new Date().toISOString(),
    };

    const { data: upserted, error } = await (admin as any)
      .from("rnest_social_friend_meta")
      .upsert(newRow, { onConflict: "owner_id,friend_id" })
      .select("pinned, alias, muted")
      .single();

    if (error) throw error;

    return jsonNoStore({
      ok: true,
      data: {
        pinned: upserted.pinned ?? false,
        alias: upserted.alias ?? "",
        muted: upserted.muted ?? false,
      },
    });
  } catch (err: any) {
    console.error("[SocialFriendMeta/PATCH] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_update_friend_meta" }, { status: 500 });
  }
}

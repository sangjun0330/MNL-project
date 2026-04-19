import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import {
  assertSocialWriteAccess,
  getSocialAccessErrorCode,
} from "@/lib/server/socialAdmin";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  isSocialActionRateLimited,
  recordSocialActionAttempt,
} from "@/lib/server/socialSecurity";
import { getSocialProfileHeaderByHandle } from "@/lib/server/socialHub";

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
    await assertSocialWriteAccess(admin, userId);
    const limited = await isSocialActionRateLimited({
      req,
      userId,
      action: "connect_request",
      maxPerUser: 20,
      maxPerIp: 30,
      windowMinutes: 10,
    });
    if (limited) {
      await recordSocialActionAttempt({ req, userId, action: "connect_request", success: false, detail: "rate_limited" });
      return jsonNoStore({ ok: false, error: "too_many_requests" }, { status: 429 });
    }

    const profile = await getSocialProfileHeaderByHandle(admin, handle, userId);
    if (!profile) {
      return jsonNoStore({ ok: false, error: "not_found" }, { status: 404 });
    }

    const receiverId = profile.userId;
    if (receiverId === userId) {
      return jsonNoStore({ ok: false, error: "cannot_connect_to_self" }, { status: 400 });
    }

    const { data: existingRows } = await (admin as any)
      .from("rnest_connections")
      .select("id, status, requester_id, receiver_id")
      .or(`and(requester_id.eq.${userId},receiver_id.eq.${receiverId}),and(requester_id.eq.${receiverId},receiver_id.eq.${userId})`)
      .limit(2);

    const existing: any = (existingRows ?? []).sort((a: any, b: any) => {
      const priority: Record<string, number> = { blocked: 3, accepted: 2, pending: 1, rejected: 0 };
      return (priority[b.status] ?? 0) - (priority[a.status] ?? 0);
    })[0] ?? null;

    if (existing) {
      if (existing.status === "accepted") {
        return jsonNoStore({ ok: false, error: "already_connected" }, { status: 409 });
      }
      if (existing.status === "pending") {
        return jsonNoStore({ ok: false, error: "request_already_pending" }, { status: 409 });
      }
      if (existing.status === "blocked") {
        return jsonNoStore({ ok: false, error: "blocked" }, { status: 403 });
      }
      await (admin as any).from("rnest_connections").delete().eq("id", existing.id);
    }

    const { data: receiverPrefs } = await (admin as any)
      .from("rnest_social_preferences")
      .select("accept_invites")
      .eq("user_id", receiverId)
      .maybeSingle();
    if (receiverPrefs?.accept_invites === false) {
      return jsonNoStore({ ok: false, error: "invites_disabled" }, { status: 403 });
    }

    const { data: conn, error: connErr } = await (admin as any)
      .from("rnest_connections")
      .insert({ requester_id: userId, receiver_id: receiverId, status: "pending" })
      .select("id")
      .single();
    if (connErr) throw connErr;

    const { data: requesterProfile } = await (admin as any)
      .from("rnest_social_profiles")
      .select("nickname, avatar_emoji")
      .eq("user_id", userId)
      .maybeSingle();

    await (admin as any).from("rnest_social_events").upsert(
      {
        recipient_id: receiverId,
        actor_id: userId,
        type: "connection_request",
        entity_id: String(conn.id),
        payload: {
          nickname: requesterProfile?.nickname ?? "",
          avatarEmoji: requesterProfile?.avatar_emoji ?? "🐧",
        },
        dedupe_key: `req-${conn.id}`,
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true }
    );

    await recordSocialActionAttempt({ req, userId, action: "connect_request", success: true, detail: "ok" });
    return jsonNoStore({ ok: true, data: { connectionId: conn.id } }, { status: 201 });
  } catch (err: any) {
    const accessCode = getSocialAccessErrorCode(err);
    if (accessCode) return jsonNoStore({ ok: false, error: accessCode }, { status: 403 });
    await recordSocialActionAttempt({ req, userId, action: "connect_request", success: false, detail: "failed" });
    console.error("[SocialFriendRequest/POST] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_send_request" }, { status: 500 });
  }
}

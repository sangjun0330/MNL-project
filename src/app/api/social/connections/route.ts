import { jsonNoStore } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import {
  assertSocialReadAccess,
  getSocialAccessErrorCode,
} from "@/lib/server/socialAdmin";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// GET /api/social/connections — 연결 목록 조회
export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) {
    return jsonNoStore({
      ok: true,
      data: { accepted: [], pendingIncoming: [], pendingSent: [] },
    });
  }

  const admin = getSupabaseAdmin();

  try {
    await assertSocialReadAccess(admin, userId);
    // 나와 관련된 모든 연결 조회
    const { data: rows, error } = await (admin as any)
      .from("rnest_connections")
      .select("id, requester_id, receiver_id, status, created_at, updated_at")
      .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
      .in("status", ["pending", "accepted"])
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const connections = rows ?? [];

    // 상대방 user_id 목록 수집
    const otherIds = Array.from(
      new Set(
        connections.map((c: any) => (c.requester_id === userId ? c.receiver_id : c.requester_id))
      )
    );

    // 소셜 프로필 + 프라이버시 설정 일괄 조회
    let profileMap: Record<string, { nickname: string; avatar_emoji: string; status_message: string }> = {};
    let prefMap: Record<string, { status_message_visible: boolean }> = {};
    if (otherIds.length > 0) {
      const [{ data: profiles }, { data: prefs }] = await Promise.all([
        (admin as any)
          .from("rnest_social_profiles")
          .select("user_id, nickname, avatar_emoji, status_message")
          .in("user_id", otherIds),
        (admin as any)
          .from("rnest_social_preferences")
          .select("user_id, status_message_visible")
          .in("user_id", otherIds),
      ]);

      for (const p of profiles ?? []) {
        profileMap[p.user_id] = {
          nickname: p.nickname,
          avatar_emoji: p.avatar_emoji,
          status_message: p.status_message ?? "",
        };
      }

      for (const p of prefs ?? []) {
        prefMap[p.user_id] = {
          status_message_visible: p.status_message_visible !== false,
        };
      }
    }

    const accepted: any[] = [];
    const pendingIncoming: any[] = [];
    const pendingSent: any[] = [];

    for (const c of connections) {
      const isRequester = c.requester_id === userId;
      const otherId = isRequester ? c.receiver_id : c.requester_id;
      const profile = profileMap[otherId] ?? { nickname: "", avatar_emoji: "🐧", status_message: "" };
      const pref = prefMap[otherId] ?? { status_message_visible: true };

      const entry = {
        id: c.id,
        userId: otherId,
        nickname: profile.nickname,
        avatarEmoji: profile.avatar_emoji,
        statusMessage: pref.status_message_visible ? profile.status_message : "",
        timestamp: c.status === "accepted" ? c.updated_at : c.created_at,
      };

      if (c.status === "accepted") {
        accepted.push({ ...entry, connectedAt: c.updated_at });
      } else if (c.status === "pending") {
        if (isRequester) {
          pendingSent.push({ ...entry, requestedAt: c.created_at });
        } else {
          pendingIncoming.push({ ...entry, requestedAt: c.created_at });
        }
      }
    }

    return jsonNoStore({
      ok: true,
      data: { accepted, pendingIncoming, pendingSent },
    });
  } catch (err: any) {
    const accessCode = getSocialAccessErrorCode(err);
    if (accessCode) return jsonNoStore({ ok: false, error: accessCode }, { status: 403 });
    console.error("[SocialConnections/GET] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_list_connections" }, { status: 500 });
  }
}

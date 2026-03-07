import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { isSocialActionRateLimited, recordSocialActionAttempt } from "@/lib/server/socialSecurity";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function sanitizeCode(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

// POST /api/social/connect — 코드로 연결 요청
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

  const code = sanitizeCode(body?.code);
  if (code.length !== 6) {
    return jsonNoStore({ ok: false, error: "invalid_code_format" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
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

    // 1. 코드 → receiverId 조회 (admin client로 RLS 우회)
    const { data: codeRow, error: codeErr } = await (admin as any)
      .from("rnest_connect_codes")
      .select("user_id")
      .eq("code", code)
      .maybeSingle();

    if (codeErr) throw codeErr;
    if (!codeRow) {
      await recordSocialActionAttempt({ req, userId, action: "connect_request", success: false, detail: "code_not_found" });
      return jsonNoStore({ ok: false, error: "code_not_found" }, { status: 404 });
    }

    const receiverId: string = codeRow.user_id;

    // 2. 자기 자신
    if (receiverId === userId) {
      await recordSocialActionAttempt({ req, userId, action: "connect_request", success: false, detail: "self" });
      return jsonNoStore({ ok: false, error: "cannot_connect_to_self" }, { status: 400 });
    }

    // 3. 기존 연결 상태 확인 (양방향)
    // .maybeSingle() 대신 .limit(2)로 레이스컨디션 안전하게 처리
    const { data: existingRows } = await (admin as any)
      .from("rnest_connections")
      .select("id, status, requester_id, receiver_id")
      .or(`and(requester_id.eq.${userId},receiver_id.eq.${receiverId}),and(requester_id.eq.${receiverId},receiver_id.eq.${userId})`)
      .limit(2);

    // 가장 최신 연결 (blocked/accepted 우선, 없으면 첫 번째)
    const existing: any = (existingRows ?? []).sort((a: any, b: any) => {
      const priority: Record<string, number> = { blocked: 3, accepted: 2, pending: 1, rejected: 0 };
      return (priority[b.status] ?? 0) - (priority[a.status] ?? 0);
    })[0] ?? null;

    if (existing) {
      if (existing.status === "accepted") {
        await recordSocialActionAttempt({ req, userId, action: "connect_request", success: false, detail: "accepted" });
        return jsonNoStore({ ok: false, error: "already_connected" }, { status: 409 });
      }
      if (existing.status === "pending") {
        await recordSocialActionAttempt({ req, userId, action: "connect_request", success: false, detail: "pending" });
        return jsonNoStore({ ok: false, error: "request_already_pending" }, { status: 409 });
      }
      if (existing.status === "blocked") {
        await recordSocialActionAttempt({ req, userId, action: "connect_request", success: false, detail: "blocked" });
        return jsonNoStore({ ok: false, error: "blocked" }, { status: 403 });
      }
      // rejected → 삭제 후 재생성
      await (admin as any).from("rnest_connections").delete().eq("id", existing.id);
    }

    // 3-B: 수신자의 accept_invites 설정 확인
    const { data: receiverPrefs } = await (admin as any)
      .from("rnest_social_preferences")
      .select("accept_invites")
      .eq("user_id", receiverId)
      .maybeSingle();

    if (receiverPrefs?.accept_invites === false) {
      await recordSocialActionAttempt({ req, userId, action: "connect_request", success: false, detail: "invites_disabled" });
      return jsonNoStore({ ok: false, error: "invites_disabled" }, { status: 403 });
    }

    // 4. 연결 요청 insert
    const { data: conn, error: connErr } = await (admin as any)
      .from("rnest_connections")
      .insert({ requester_id: userId, receiver_id: receiverId, status: "pending" })
      .select("id")
      .single();

    if (connErr) throw connErr;

    // 5. 상대방 닉네임 조회 (있으면 반환)
    const { data: profile } = await (admin as any)
      .from("rnest_social_profiles")
      .select("nickname, avatar_emoji")
      .eq("user_id", receiverId)
      .maybeSingle();

    await recordSocialActionAttempt({ req, userId, action: "connect_request", success: true, detail: "ok" });

    // 6. 수신자에게 connection_request 이벤트 생성
    // 요청자 프로필 조회
    const { data: requesterProfile } = await (admin as any)
      .from("rnest_social_profiles")
      .select("nickname, avatar_emoji")
      .eq("user_id", userId)
      .maybeSingle();

    // dedupe_key UNIQUE — 재시도 시 중복 무시
    const { error: eventErr } = await (admin as any)
      .from("rnest_social_events")
      .upsert(
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
    if (eventErr) {
      console.warn("[SocialConnect/POST] event upsert skipped: %s", eventErr.code);
    }

    return jsonNoStore({
      ok: true,
      data: {
        connectionId: conn.id,
        receiverNickname: profile?.nickname || null,
        receiverAvatarEmoji: profile?.avatar_emoji || "🐧",
      },
    });
  } catch (err: any) {
    await recordSocialActionAttempt({ req, userId, action: "connect_request", success: false, detail: "failed" });
    console.error("[SocialConnect/POST] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_send_request" }, { status: 500 });
  }
}

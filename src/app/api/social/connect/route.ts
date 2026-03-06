import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

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
    // 1. 코드 → receiverId 조회 (admin client로 RLS 우회)
    const { data: codeRow, error: codeErr } = await (admin as any)
      .from("rnest_connect_codes")
      .select("user_id")
      .eq("code", code)
      .maybeSingle();

    if (codeErr) throw codeErr;
    if (!codeRow) {
      return jsonNoStore({ ok: false, error: "code_not_found" }, { status: 404 });
    }

    const receiverId: string = codeRow.user_id;

    // 2. 자기 자신
    if (receiverId === userId) {
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
        return jsonNoStore({ ok: false, error: "already_connected" }, { status: 409 });
      }
      if (existing.status === "pending") {
        return jsonNoStore({ ok: false, error: "request_already_pending" }, { status: 409 });
      }
      if (existing.status === "blocked") {
        return jsonNoStore({ ok: false, error: "blocked" }, { status: 403 });
      }
      // rejected → 삭제 후 재생성
      await (admin as any).from("rnest_connections").delete().eq("id", existing.id);
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

    return jsonNoStore({
      ok: true,
      data: {
        connectionId: conn.id,
        receiverNickname: profile?.nickname || null,
        receiverAvatarEmoji: profile?.avatar_emoji || "🐧",
      },
    });
  } catch (err: any) {
    console.error("[SocialConnect/POST] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_send_request" }, { status: 500 });
  }
}

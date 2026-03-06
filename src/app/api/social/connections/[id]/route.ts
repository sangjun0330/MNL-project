import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type Action = "accept" | "reject" | "delete" | "block";

// PATCH /api/social/connections/[id] — 수락/거절/삭제/차단
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const { id: rawId } = await params;
  const connectionId = parseInt(rawId, 10);
  if (!connectionId || isNaN(connectionId)) {
    return jsonNoStore({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const action: Action = body?.action;
  if (!["accept", "reject", "delete", "block"].includes(action)) {
    return jsonNoStore({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    // 연결 조회
    const { data: conn, error: fetchErr } = await (admin as any)
      .from("rnest_connections")
      .select("id, requester_id, receiver_id, status")
      .eq("id", connectionId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!conn) return jsonNoStore({ ok: false, error: "connection_not_found" }, { status: 404 });

    const isRequester = conn.requester_id === userId;
    const isReceiver = conn.receiver_id === userId;

    if (!isRequester && !isReceiver) {
      return jsonNoStore({ ok: false, error: "forbidden" }, { status: 403 });
    }

    // 권한 검증
    if ((action === "accept" || action === "reject" || action === "block") && !isReceiver) {
      return jsonNoStore({ ok: false, error: "only_receiver_can_respond" }, { status: 403 });
    }

    if (action === "delete") {
      const { error: delErr } = await (admin as any)
        .from("rnest_connections")
        .delete()
        .eq("id", connectionId);
      if (delErr) throw delErr;
      return jsonNoStore({ ok: true });
    }

    const newStatus = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "blocked";
    const { error: updateErr } = await (admin as any)
      .from("rnest_connections")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", connectionId);

    if (updateErr) throw updateErr;
    return jsonNoStore({ ok: true });
  } catch (err: any) {
    console.error("[SocialConnections/PATCH] id=%d err=%s", connectionId, String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_update_connection" }, { status: 500 });
  }
}

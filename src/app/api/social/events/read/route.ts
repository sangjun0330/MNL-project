import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import {
  assertSocialReadAccess,
  getSocialAccessErrorCode,
} from "@/lib/server/socialAdmin";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// POST /api/social/events/read
// body: { all?: true } | { ids?: number[] }
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

  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  try {
    await assertSocialReadAccess(admin, userId);
    if (body?.all === true) {
      // 모두 읽음 처리
      const { error } = await (admin as any)
        .from("rnest_social_events")
        .update({ read_at: now })
        .eq("recipient_id", userId)
        .is("read_at", null);
      if (error) throw error;
    } else if (Array.isArray(body?.ids) && body.ids.length > 0) {
      // 특정 id 읽음 처리 (최대 100개)
      const ids = body.ids.slice(0, 100).map(Number).filter(Number.isFinite);
      if (ids.length > 0) {
        const { error } = await (admin as any)
          .from("rnest_social_events")
          .update({ read_at: now })
          .eq("recipient_id", userId)
          .in("id", ids)
          .is("read_at", null);
        if (error) throw error;
      }
    } else {
      return jsonNoStore({ ok: false, error: "missing_ids_or_all" }, { status: 400 });
    }

    return jsonNoStore({ ok: true });
  } catch (err: any) {
    const accessCode = getSocialAccessErrorCode(err);
    if (accessCode) return jsonNoStore({ ok: false, error: accessCode }, { status: 403 });
    console.error("[SocialEvents/read/POST] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_mark_read" }, { status: 500 });
  }
}

import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { cancelSocialAdminChallenge, requireSocialAdmin } from "@/lib/server/socialAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ challengeId: string }> },
) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const access = await requireSocialAdmin(req);
  if (!access.ok) {
    return jsonNoStore({ ok: false, error: access.error }, { status: access.status });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {}

  try {
    const { challengeId: rawChallengeId } = await params;
    const challengeId = Number.parseInt(rawChallengeId, 10);
    if (!Number.isFinite(challengeId) || challengeId <= 0) {
      return jsonNoStore({ ok: false, error: "invalid_challenge_id" }, { status: 400 });
    }
    await cancelSocialAdminChallenge({
      admin: getSupabaseAdmin(),
      adminUserId: access.identity.userId,
      challengeId,
      reason: body?.reason,
    });
    return jsonNoStore({ ok: true });
  } catch (error: any) {
    const message = String(error?.message ?? error);
    if (message === "challenge_not_found" || message === "challenge_already_ended") {
      return jsonNoStore({ ok: false, error: message }, { status: 409 });
    }
    console.error("[AdminSocialChallengeCancel/POST] err=%s", message);
    return jsonNoStore({ ok: false, error: "failed_to_cancel_social_challenge" }, { status: 500 });
  }
}

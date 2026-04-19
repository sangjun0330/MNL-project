/**
 * POST /api/social/groups/[groupId]/challenges/[challengeId]/join
 * 챌린지 참가
 */
import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import {
  assertSocialWriteAccess,
  getSocialAccessErrorCode,
} from "@/lib/server/socialAdmin";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { parseSocialGroupId } from "@/lib/server/socialGroups";
import { joinChallenge } from "@/lib/server/socialChallenges";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function parseChallengeId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ groupId: string; challengeId: string }> }
) {
  const sameOriginErr = sameOriginRequestError(req);
  if (sameOriginErr) {
    return jsonNoStore({ ok: false, error: sameOriginErr }, { status: 403 });
  }

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const { groupId: rawGroupId, challengeId: rawChallengeId } = await params;
  const groupId = parseSocialGroupId(rawGroupId);
  const challengeId = parseChallengeId(rawChallengeId);
  if (!groupId || !challengeId) {
    return jsonNoStore({ ok: false, error: "invalid_params" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  try {
    await assertSocialWriteAccess(admin, userId);

    const { data: membership } = await (admin as any)
      .from("rnest_social_group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) {
      return jsonNoStore({ ok: false, error: "not_group_member" }, { status: 403 });
    }

    const { data: challenge } = await (admin as any)
      .from("rnest_social_group_challenges")
      .select("id, status, group_id")
      .eq("id", challengeId)
      .maybeSingle();

    if (!challenge || Number(challenge.group_id) !== groupId) {
      return jsonNoStore({ ok: false, error: "challenge_not_found" }, { status: 404 });
    }
    if (challenge.status !== "active") {
      return jsonNoStore({ ok: false, error: "challenge_not_active" }, { status: 409 });
    }

    const entry = await joinChallenge(admin, challengeId, userId);
    return jsonNoStore({ ok: true, data: entry }, { status: 201 });
  } catch (err: any) {
    const accessCode = getSocialAccessErrorCode(err);
    if (accessCode) return jsonNoStore({ ok: false, error: accessCode }, { status: 403 });
    console.error("[challenges/join/POST] error:", err?.message);
    return jsonNoStore({ ok: false, error: "join_failed" }, { status: 500 });
  }
}

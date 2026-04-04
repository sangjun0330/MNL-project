/**
 * GET    /api/social/groups/[groupId]/challenges/[challengeId]  → 상세 + 리더보드
 * DELETE /api/social/groups/[groupId]/challenges/[challengeId]  → 취소 (admin+)
 */
import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  buildSocialGroupPermissions,
  normalizeSocialGroupRole,
  parseSocialGroupId,
} from "@/lib/server/socialGroups";
import {
  getGroupChallengeDetail,
  cancelChallenge,
} from "@/lib/server/socialChallenges";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function parseChallengeId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── GET: 챌린지 상세 ─────────────────────────────────────────

export async function GET(
  req: Request,
  { params }: { params: Promise<{ groupId: string; challengeId: string }> }
) {
  // GET read path:
  // The app uses Referrer-Policy: no-referrer, so same-origin browser fetches may not
  // include Referer or Origin. Keeping sameOriginRequestError here breaks legitimate
  // challenge detail loads from the client. State-changing routes still enforce it.

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const { groupId: rawGroupId, challengeId: rawChallengeId } = await params;
  const groupId = parseSocialGroupId(rawGroupId);
  const challengeId = parseChallengeId(rawChallengeId);
  if (!groupId || !challengeId) {
    return jsonNoStore({ ok: false, error: "invalid_params" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // 멤버 확인
  const { data: membership } = await (admin as any)
    .from("rnest_social_group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    return jsonNoStore({ ok: false, error: "not_group_member" }, { status: 403 });
  }

  try {
    const detail = await getGroupChallengeDetail(admin, challengeId, userId);
    if (!detail || detail.groupId !== groupId) {
      return jsonNoStore({ ok: false, error: "challenge_not_found" }, { status: 404 });
    }
    return jsonNoStore({ ok: true, data: detail });
  } catch (err: any) {
    console.error("[challenges/:id/GET] error:", err?.message);
    return jsonNoStore({ ok: false, error: "fetch_failed" }, { status: 500 });
  }
}

// ── DELETE: 챌린지 취소 ──────────────────────────────────────

export async function DELETE(
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

  const { data: membership } = await (admin as any)
    .from("rnest_social_group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    return jsonNoStore({ ok: false, error: "not_group_member" }, { status: 403 });
  }

  const role = normalizeSocialGroupRole(membership.role);
  const permissions = buildSocialGroupPermissions(role, false);
  const isManager = permissions.canEditBasicInfo;

  try {
    await cancelChallenge(admin, challengeId, userId, isManager);
    return jsonNoStore({ ok: true });
  } catch (err: any) {
    const msg = err?.message ?? "";
    if (msg === "challenge_not_found") {
      return jsonNoStore({ ok: false, error: "challenge_not_found" }, { status: 404 });
    }
    if (msg === "challenge_already_ended") {
      return jsonNoStore({ ok: false, error: "challenge_already_ended" }, { status: 409 });
    }
    if (msg === "challenge_cancel_forbidden") {
      return jsonNoStore({ ok: false, error: "challenge_cancel_forbidden" }, { status: 403 });
    }
    console.error("[challenges/:id/DELETE] error:", msg);
    return jsonNoStore({ ok: false, error: "cancel_failed" }, { status: 500 });
  }
}

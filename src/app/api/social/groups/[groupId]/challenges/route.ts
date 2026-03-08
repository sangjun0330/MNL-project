/**
 * GET  /api/social/groups/[groupId]/challenges  → 챌린지 목록
 * POST /api/social/groups/[groupId]/challenges  → 챌린지 생성 (admin+)
 */
import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  isSocialActionRateLimited,
  recordSocialActionAttempt,
} from "@/lib/server/socialSecurity";
import {
  buildSocialGroupPermissions,
  normalizeSocialGroupRole,
  parseSocialGroupId,
  appendSocialEvent,
  listSocialGroupRecipientIds,
} from "@/lib/server/socialGroups";
import {
  listGroupChallenges,
  createGroupChallenge,
} from "@/lib/server/socialChallenges";
import type { CreateChallengePayload } from "@/types/social";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// ── GET: 챌린지 목록 ─────────────────────────────────────────

export async function GET(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const sameOriginErr = sameOriginRequestError(req);
  if (sameOriginErr) {
    return jsonNoStore({ ok: false, error: sameOriginErr }, { status: 403 });
  }

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const { groupId: rawGroupId } = await params;
  const groupId = parseSocialGroupId(rawGroupId);
  if (!groupId) return jsonNoStore({ ok: false, error: "invalid_group_id" }, { status: 400 });

  const admin = getSupabaseAdmin();

  // 그룹 멤버 확인
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
    const challenges = await listGroupChallenges(admin, groupId, userId);
    return jsonNoStore({ ok: true, data: challenges });
  } catch (err: any) {
    console.error("[challenges/GET] error:", err?.message);
    return jsonNoStore({ ok: false, error: "fetch_failed" }, { status: 500 });
  }
}

// ── POST: 챌린지 생성 ────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const sameOriginErr = sameOriginRequestError(req);
  if (sameOriginErr) {
    return jsonNoStore({ ok: false, error: sameOriginErr }, { status: 403 });
  }

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const { groupId: rawGroupId } = await params;
  const groupId = parseSocialGroupId(rawGroupId);
  if (!groupId) return jsonNoStore({ ok: false, error: "invalid_group_id" }, { status: 400 });

  const admin = getSupabaseAdmin();

  // 멤버십 + 권한 확인
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
  if (!permissions.canEditBasicInfo) {
    return jsonNoStore({ ok: false, error: "challenge_create_forbidden" }, { status: 403 });
  }

  // Rate limit: 1시간 내 챌린지 생성 3회 초과 방지
  const rateLimited = await isSocialActionRateLimited({
    req,
    userId,
    action: "create_challenge",
    maxPerUser: 3,
    windowMinutes: 60,
  });
  if (rateLimited) {
    return jsonNoStore({ ok: false, error: "too_many_requests" }, { status: 429 });
  }

  let body: CreateChallengePayload;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  try {
    const challenge = await createGroupChallenge(admin, groupId, userId, body);

    await recordSocialActionAttempt({
      req,
      userId,
      action: "create_challenge",
      success: true,
    });

    // 그룹 멤버 전체에게 알림 발송 (생성자 제외)
    const { data: memberRows } = await (admin as any)
      .from("rnest_social_group_members")
      .select("user_id, role")
      .eq("group_id", groupId);

    const recipientIds = listSocialGroupRecipientIds(memberRows ?? [], {
      excludeUserIds: [userId],
    });

    await Promise.allSettled(
      recipientIds.map((recipientId) =>
        appendSocialEvent({
          admin,
          recipientId,
          actorId: userId,
          type: "challenge_created" as any,
          entityId: String(challenge.id),
          payload: { challengeTitle: challenge.title, groupId: String(groupId) },
          dedupeKey: `challenge_created_${challenge.id}`,
        })
      )
    );

    return jsonNoStore({ ok: true, data: challenge }, { status: 201 });
  } catch (err: any) {
    console.error("[challenges/POST] error:", err?.message);
    if (err?.message === "challenge_title_required") {
      return jsonNoStore({ ok: false, error: "challenge_title_required" }, { status: 400 });
    }
    if (err?.message === "too_many_active_challenges") {
      return jsonNoStore({ ok: false, error: "too_many_active_challenges" }, { status: 409 });
    }
    return jsonNoStore({ ok: false, error: "create_failed" }, { status: 500 });
  }
}

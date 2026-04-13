import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";
import { deletePost, getPostById, updatePost, cleanPostBody, cleanPostTags, cleanPostImagePaths } from "@/lib/server/socialPosts";
import type { SocialHealthBadge, RecoveryCardSnapshot, SocialPostVisibility } from "@/types/social";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const { postId: rawPostId } = await params;
  const postId = Number.parseInt(rawPostId, 10);
  if (!Number.isFinite(postId) || postId <= 0) {
    return jsonNoStore({ ok: false, error: "invalid_post_id" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  try {
    const post = await getPostById(admin, postId, userId);
    if (!post) {
      return jsonNoStore({ ok: false, error: "not_found" }, { status: 404 });
    }
    return jsonNoStore({ ok: true, data: { post } });
  } catch (err: any) {
    console.error("[SocialPost/GET] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_get_post" }, { status: 500 });
  }
}

// PATCH /api/social/posts/[postId]
// - 본인 게시글만 수정 가능 (body, tags, visibility, addImagePaths, removeImagePaths, healthBadge, recoveryCard)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const { postId: rawPostId } = await params;
  const postId = Number.parseInt(rawPostId, 10);
  if (!Number.isFinite(postId) || postId <= 0) {
    return jsonNoStore({ ok: false, error: "invalid_post_id" }, { status: 400 });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const patch: Parameters<typeof updatePost>[3] = {};

  if (body?.body !== undefined) patch.body = cleanPostBody(body.body);
  if (body?.tags !== undefined) patch.tags = cleanPostTags(body.tags);
  if (body?.visibility !== undefined) {
    const vis = body.visibility as SocialPostVisibility;
    if (["public_internal", "followers", "friends", "group"].includes(vis)) {
      patch.visibility = vis;
      patch.groupId = Number.isFinite(Number(body?.groupId)) ? Number(body.groupId) : null;
    }
  }
  if (Array.isArray(body?.addImagePaths)) {
    patch.addImagePaths = cleanPostImagePaths(body.addImagePaths);
  }
  if (Array.isArray(body?.removeImagePaths)) {
    patch.removeImagePaths = (body.removeImagePaths as unknown[]).map(String);
  }

  const rawHealthBadge = body?.healthBadge;
  if (rawHealthBadge !== undefined) {
    patch.healthBadge =
      rawHealthBadge && typeof rawHealthBadge === "object"
        ? ({
            shiftType: typeof rawHealthBadge.shiftType === "string" ? rawHealthBadge.shiftType.slice(0, 8) : undefined,
            batteryLevel: typeof rawHealthBadge.batteryLevel === "number" ? Math.max(0, Math.min(100, rawHealthBadge.batteryLevel)) : undefined,
            burnoutLevel: ["ok", "warning", "danger"].includes(rawHealthBadge.burnoutLevel) ? rawHealthBadge.burnoutLevel : undefined,
          } as SocialHealthBadge as unknown as Record<string, unknown>)
        : null;
  }

  const rawRecoveryCard = body?.recoveryCard;
  if (rawRecoveryCard !== undefined) {
    patch.recoveryCard =
      rawRecoveryCard && typeof rawRecoveryCard === "object" && typeof rawRecoveryCard.headline === "string"
        ? ({
            headline: String(rawRecoveryCard.headline).slice(0, 100),
            batteryAvg: typeof rawRecoveryCard.batteryAvg === "number" ? Math.max(0, Math.min(100, rawRecoveryCard.batteryAvg)) : null,
            sleepDebtHours: typeof rawRecoveryCard.sleepDebtHours === "number" ? rawRecoveryCard.sleepDebtHours : null,
            weekDays: typeof rawRecoveryCard.weekDays === "number" ? rawRecoveryCard.weekDays : 7,
          } as RecoveryCardSnapshot as unknown as Record<string, unknown>)
        : null;
  }

  try {
    const updatedPost = await updatePost(admin, postId, userId, patch);
    return jsonNoStore({ ok: true, data: { post: updatedPost } });
  } catch (err: any) {
    if (err?.code === "not_found") return jsonNoStore({ ok: false, error: "not_found" }, { status: 404 });
    if (err?.code === "invalid_image_path") return jsonNoStore({ ok: false, error: "invalid_image_path" }, { status: 400 });
    console.error("[SocialPost/PATCH] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_update_post" }, { status: 500 });
  }
}

// DELETE /api/social/posts/[postId]
// - 본인 게시글: 누구나 삭제 가능
// - 타인 게시글: 관리자(BILLING_ADMIN_USER_IDS)만 삭제 가능
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const { postId: rawPostId } = await params;
  const postId = Number.parseInt(rawPostId, 10);
  if (!Number.isFinite(postId) || postId <= 0) {
    return jsonNoStore({ ok: false, error: "invalid_post_id" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // 게시글 작성자 확인
  const { data: postRow } = await (admin as any)
    .from("rnest_social_posts")
    .select("id, author_user_id")
    .eq("id", postId)
    .maybeSingle();

  if (!postRow) {
    return jsonNoStore({ ok: false, error: "not_found" }, { status: 404 });
  }

  const isOwn = String(postRow.author_user_id) === userId;
  let isAdmin = false;

  if (!isOwn) {
    // 본인 게시글이 아닌 경우 관리자 권한 확인
    const adminCheck = await requireBillingAdmin(req);
    if (!adminCheck.ok) {
      return jsonNoStore({ ok: false, error: "forbidden" }, { status: 403 });
    }
    isAdmin = true;
  }

  try {
    await deletePost(admin, postId, userId, isAdmin);
    return jsonNoStore({ ok: true });
  } catch (err: any) {
    console.error("[SocialPost/DELETE] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_delete_post" }, { status: 500 });
  }
}

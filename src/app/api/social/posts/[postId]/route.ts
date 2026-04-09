import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";
import { deletePost } from "@/lib/server/socialPosts";

export const runtime = "edge";
export const dynamic = "force-dynamic";

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

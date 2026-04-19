import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import {
  assertSocialWriteAccess,
  getSocialAccessErrorCode,
} from "@/lib/server/socialAdmin";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { togglePostLike, canUserAccessPost } from "@/lib/server/socialPosts";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// POST /api/social/posts/[postId]/like
// 좋아요 토글: 있으면 취소, 없으면 추가
export async function POST(
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

  try {
    await assertSocialWriteAccess(admin, userId);
    const { data: postRow } = await (admin as any)
      .from("rnest_social_posts")
      .select("id, author_user_id, visibility, group_id")
      .eq("id", postId)
      .maybeSingle();

    if (!postRow) {
      return jsonNoStore({ ok: false, error: "not_found" }, { status: 404 });
    }

    const canAccess = await canUserAccessPost(admin, postRow, userId);
    if (!canAccess) {
      return jsonNoStore({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const result = await togglePostLike(admin, postId, userId);
    return jsonNoStore({ ok: true, data: result });
  } catch (err: any) {
    const accessCode = getSocialAccessErrorCode(err);
    if (accessCode) return jsonNoStore({ ok: false, error: accessCode }, { status: 403 });
    console.error("[SocialPostLike/POST] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_toggle_like" }, { status: 500 });
  }
}

import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  canUserAccessPost,
  toggleCommentLike,
} from "@/lib/server/socialPosts";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ postId: string; commentId: string }> }
) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const { postId: rawPostId, commentId: rawCommentId } = await params;
  const postId = Number.parseInt(rawPostId, 10);
  const commentId = Number.parseInt(rawCommentId, 10);
  if (!Number.isFinite(postId) || postId <= 0 || !Number.isFinite(commentId) || commentId <= 0) {
    return jsonNoStore({ ok: false, error: "invalid_comment_id" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const [{ data: postRow }, { data: commentRow }] = await Promise.all([
    (admin as any)
      .from("rnest_social_posts")
      .select("id, author_user_id, visibility, group_id")
      .eq("id", postId)
      .maybeSingle(),
    (admin as any)
      .from("rnest_social_post_comments")
      .select("id, post_id")
      .eq("id", commentId)
      .maybeSingle(),
  ]);

  if (!postRow || !commentRow || Number(commentRow.post_id) !== postId) {
    return jsonNoStore({ ok: false, error: "not_found" }, { status: 404 });
  }

  const canAccess = await canUserAccessPost(admin, postRow, userId);
  if (!canAccess) {
    return jsonNoStore({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await toggleCommentLike(admin, commentId, userId);
    return jsonNoStore({ ok: true, data: result });
  } catch (err: any) {
    console.error("[SocialCommentLike/POST] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_toggle_comment_like" }, { status: 500 });
  }
}

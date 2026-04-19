import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";
import {
  assertSocialReadAccess,
  assertSocialWriteAccess,
  getSocialAccessErrorCode,
} from "@/lib/server/socialAdmin";
import {
  isSocialActionRateLimited,
  recordSocialActionAttempt,
} from "@/lib/server/socialSecurity";
import {
  cleanCommentBody,
  getPostComments,
  addComment,
  deleteComment,
  canUserAccessPost,
} from "@/lib/server/socialPosts";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// GET /api/social/posts/[postId]/comments?cursor=ISO_STRING
export async function GET(
  req: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: true, data: { comments: [], nextCursor: null } });

  const { postId: rawPostId } = await params;
  const postId = Number.parseInt(rawPostId, 10);
  if (!Number.isFinite(postId) || postId <= 0) {
    return jsonNoStore({ ok: false, error: "invalid_post_id" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") || null;

  try {
    await assertSocialReadAccess(admin, userId);
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
    const result = await getPostComments(admin, postId, userId, cursor);
    return jsonNoStore({ ok: true, data: result });
  } catch (err: any) {
    const accessCode = getSocialAccessErrorCode(err);
    if (accessCode) return jsonNoStore({ ok: false, error: accessCode }, { status: 403 });
    console.error("[SocialPostComments/GET] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_load_comments" }, { status: 500 });
  }
}

// POST /api/social/posts/[postId]/comments
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

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const commentBody = cleanCommentBody(body?.body);
  if (!commentBody) {
    return jsonNoStore({ ok: false, error: "body_required" }, { status: 400 });
  }
  const parentId =
    Number.isFinite(Number(body?.parentId)) && Number(body.parentId) > 0
      ? Number(body.parentId)
      : null;

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
    const limited = await isSocialActionRateLimited({
      req,
      userId,
      action: "post_comment",
      maxPerUser: 60,
      maxPerIp: 120,
      windowMinutes: 60,
    });
    if (limited) {
      await recordSocialActionAttempt({ req, userId, action: "post_comment", success: false, detail: "rate_limited" });
      return jsonNoStore({ ok: false, error: "too_many_requests" }, { status: 429 });
    }

    const comment = await addComment(admin, postId, userId, commentBody, { parentId });
    await recordSocialActionAttempt({ req, userId, action: "post_comment", success: true, detail: "ok" });
    return jsonNoStore({ ok: true, data: { comment } }, { status: 201 });
  } catch (err: any) {
    const accessCode = getSocialAccessErrorCode(err);
    if (accessCode) return jsonNoStore({ ok: false, error: accessCode }, { status: 403 });
    if (err?.code === "invalid_parent_comment") {
      return jsonNoStore({ ok: false, error: "invalid_parent_comment" }, { status: 400 });
    }
    await recordSocialActionAttempt({ req, userId, action: "post_comment", success: false, detail: "failed" });
    console.error("[SocialPostComments/POST] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_add_comment" }, { status: 500 });
  }
}

// DELETE /api/social/posts/[postId]/comments?commentId=123
// 댓글 삭제: 본인 댓글 또는 관리자
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  // postId param (not used for comment delete, but needed to resolve params)
  await params;

  const url = new URL(req.url);
  const commentId = Number.parseInt(url.searchParams.get("commentId") ?? "", 10);
  if (!Number.isFinite(commentId) || commentId <= 0) {
    return jsonNoStore({ ok: false, error: "invalid_comment_id" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // 댓글 작성자 확인
  const { data: commentRow } = await (admin as any)
    .from("rnest_social_post_comments")
    .select("id, author_user_id")
    .eq("id", commentId)
    .maybeSingle();

  if (!commentRow) {
    return jsonNoStore({ ok: false, error: "not_found" }, { status: 404 });
  }

  const isOwn = String(commentRow.author_user_id) === userId;
  let isAdmin = false;

  if (!isOwn) {
    const adminCheck = await requireBillingAdmin(req);
    if (!adminCheck.ok) {
      return jsonNoStore({ ok: false, error: "forbidden" }, { status: 403 });
    }
    isAdmin = true;
  }

  try {
    await assertSocialWriteAccess(admin, userId);
    await deleteComment(admin, commentId, userId, isAdmin);
    return jsonNoStore({ ok: true });
  } catch (err: any) {
    const accessCode = getSocialAccessErrorCode(err);
    if (accessCode) return jsonNoStore({ ok: false, error: accessCode }, { status: 403 });
    console.error("[SocialPostComments/DELETE] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_delete_comment" }, { status: 500 });
  }
}

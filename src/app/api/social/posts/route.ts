import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  isSocialActionRateLimited,
  recordSocialActionAttempt,
} from "@/lib/server/socialSecurity";
import {
  cleanPostBody,
  cleanCommentBody as _cleanComment,
  cleanPostImagePaths,
  cleanPostTags,
  getFeedPage,
  createPost,
} from "@/lib/server/socialPosts";
import { DEFAULT_SOCIAL_POST_VISIBILITY } from "@/types/social";
import type {
  SocialPostVisibility,
} from "@/types/social";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// GET /api/social/posts?cursor=ISO_STRING
export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: true, data: { posts: [], nextCursor: null } });

  const admin = getSupabaseAdmin();
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") || null;
  const scopeParam = url.searchParams.get("scope") ?? "following";
  const scope =
    scopeParam === "explore" ||
    scopeParam === "profile" ||
    scopeParam === "saved" ||
    scopeParam === "liked"
      ? scopeParam
      : "following";
  const handle = url.searchParams.get("handle") || null;

  try {
    const feed = await getFeedPage(admin, userId, { scope, cursor, handle, limit: 20 });
    return jsonNoStore({ ok: true, data: feed });
  } catch (err: any) {
    console.error("[SocialPosts/GET] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_load_feed" }, { status: 500 });
  }
}

// POST /api/social/posts
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

  const postBody = cleanPostBody(body?.body);
  const visibility: SocialPostVisibility =
    body?.visibility === "public_internal" ||
    body?.visibility === "followers" ||
    body?.visibility === "friends" ||
    body?.visibility === "group"
      ? body.visibility
      : DEFAULT_SOCIAL_POST_VISIBILITY;
  const groupId =
    visibility === "group" && Number.isFinite(Number(body?.groupId))
      ? Number(body.groupId)
      : null;
  const tags = cleanPostTags(body?.tags);
  const imagePaths = cleanPostImagePaths(
    Array.isArray(body?.imagePaths)
      ? body.imagePaths
      : body?.imagePath && typeof body.imagePath === "string"
        ? [body.imagePath]
        : []
  );
  const imagePath = imagePaths[0] ?? null;

  if (!postBody && imagePaths.length === 0) {
    return jsonNoStore({ ok: false, error: "content_required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    const limited = await isSocialActionRateLimited({
      req,
      userId,
      action: "post_create",
      maxPerUser: 20,
      maxPerIp: 50,
      windowMinutes: 60,
    });
    if (limited) {
      await recordSocialActionAttempt({ req, userId, action: "post_create", success: false, detail: "rate_limited" });
      return jsonNoStore({ ok: false, error: "too_many_requests" }, { status: 429 });
    }

    const post = await createPost(admin, userId, postBody, {
      imagePath,
      imagePaths,
      tags,
      groupId,
      visibility,
    });

    await recordSocialActionAttempt({ req, userId, action: "post_create", success: true, detail: "ok" });
    return jsonNoStore({ ok: true, data: { post } }, { status: 201 });
  } catch (err: any) {
    if (err?.code === "not_group_member") {
      return jsonNoStore({ ok: false, error: "not_group_member" }, { status: 403 });
    }
    if (err?.code === "invalid_image_path") {
      return jsonNoStore({ ok: false, error: "invalid_image_path" }, { status: 400 });
    }
    await recordSocialActionAttempt({ req, userId, action: "post_create", success: false, detail: "failed" });
    console.error("[SocialPosts/POST] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_create_post" }, { status: 500 });
  }
}

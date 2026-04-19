import { jsonNoStore } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import {
  assertSocialReadAccess,
  getSocialAccessErrorCode,
} from "@/lib/server/socialAdmin";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getFeedPage } from "@/lib/server/socialPosts";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: true, data: { posts: [], nextCursor: null } });

  const url = new URL(req.url);
  const scopeParam = url.searchParams.get("scope") ?? "following";
  const scope =
    scopeParam === "explore" ||
    scopeParam === "profile" ||
    scopeParam === "saved" ||
    scopeParam === "liked"
      ? scopeParam
      : "following";
  const cursor = url.searchParams.get("cursor") || null;
  const handle = url.searchParams.get("handle") || null;

  const admin = getSupabaseAdmin();
  try {
    await assertSocialReadAccess(admin, userId);
    const feed = await getFeedPage(admin, userId, {
      scope,
      cursor,
      handle,
      limit: 20,
    });
    return jsonNoStore({ ok: true, data: feed });
  } catch (err: any) {
    const accessCode = getSocialAccessErrorCode(err);
    if (accessCode) return jsonNoStore({ ok: false, error: accessCode }, { status: 403 });
    console.error("[SocialFeed/GET] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_load_feed" }, { status: 500 });
  }
}

import { jsonNoStore } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  listDiscoverableProfiles,
  searchSocialProfiles,
} from "@/lib/server/socialHub";
import { searchSocialPosts, getTrendingTags } from "@/lib/server/socialPosts";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) {
    return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });
  }

  const url = new URL(req.url);
  const query = String(url.searchParams.get("q") ?? "").trim();
  const tag = String(url.searchParams.get("tag") ?? "").trim();
  const wantTrending = url.searchParams.get("trending") === "1";
  const admin = getSupabaseAdmin();

  try {
    if (wantTrending) {
      const tags = await getTrendingTags(admin, 8, 7);
      return jsonNoStore({ ok: true, data: { trending: tags } });
    }

    const [profiles, posts] = await Promise.all([
      query ? searchSocialProfiles(admin, query) : listDiscoverableProfiles(admin),
      searchSocialPosts(admin, userId, query, 8, tag || undefined),
    ]);

    return jsonNoStore({ ok: true, data: { query, tag, profiles, posts } });
  } catch (err: any) {
    console.error("[SocialSearch/GET] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_search_social" }, { status: 500 });
  }
}

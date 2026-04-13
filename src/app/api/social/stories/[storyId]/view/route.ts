import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// POST /api/social/stories/[storyId]/view — 스토리 조회 기록
export async function POST(
  req: Request,
  { params }: { params: Promise<{ storyId: string }> }
) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const { storyId: rawStoryId } = await params;
  const storyId = Number.parseInt(rawStoryId, 10);
  if (!Number.isFinite(storyId) || storyId <= 0) {
    return jsonNoStore({ ok: false, error: "invalid_story_id" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    // 스토리 존재 + 만료 확인
    const { data: storyRow } = await (admin as any)
      .from("rnest_social_stories")
      .select("id, author_user_id, expires_at")
      .eq("id", storyId)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (!storyRow) {
      return jsonNoStore({ ok: false, error: "not_found" }, { status: 404 });
    }

    // 자기 스토리는 view count 제외
    if (String(storyRow.author_user_id) !== userId) {
      // upsert: 이미 본 경우 무시
      await (admin as any)
        .from("rnest_social_story_views")
        .upsert({ story_id: storyId, viewer_user_id: userId }, { onConflict: "story_id,viewer_user_id", ignoreDuplicates: true });

      // view_count 재집계
      const { count } = await (admin as any)
        .from("rnest_social_story_views")
        .select("story_id", { count: "exact", head: true })
        .eq("story_id", storyId);

      await (admin as any)
        .from("rnest_social_stories")
        .update({ view_count: Number(count ?? 0) })
        .eq("id", storyId);
    }

    return jsonNoStore({ ok: true });
  } catch (err: any) {
    console.error("[Stories/view/POST] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_record_view" }, { status: 500 });
  }
}

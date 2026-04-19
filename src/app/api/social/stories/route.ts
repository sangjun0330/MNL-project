import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  assertSocialReadAccess,
  assertSocialWriteAccess,
  getSocialAccessErrorCode,
} from "@/lib/server/socialAdmin";
import type { SocialStory, SocialStoryContentType, SocialAuthorProfile } from "@/types/social";
import { loadSocialHubProfileMap, buildSocialAuthorProfile } from "@/lib/server/socialHub";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const STORY_MEDIA_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/public/social-story-images`
  : "";

function buildStoryMediaUrl(mediaPath: string | null): string | null {
  if (!mediaPath || !STORY_MEDIA_BASE) return null;
  return `${STORY_MEDIA_BASE}/${mediaPath}`;
}

async function hydrateStories(
  admin: any,
  userId: string,
  rows: any[],
): Promise<SocialStory[]> {
  if (rows.length === 0) return [];

  const authorIds = Array.from(new Set(rows.map((r: any) => String(r.author_user_id))));
  const storyIds = rows.map((r: any) => Number(r.id));

  const [profileMap, viewRows] = await Promise.all([
    loadSocialHubProfileMap(admin, authorIds),
    storyIds.length > 0
      ? (admin as any)
          .from("rnest_social_story_views")
          .select("story_id")
          .eq("viewer_user_id", userId)
          .in("story_id", storyIds)
      : { data: [] },
  ]);

  const viewedIds = new Set<number>((viewRows.data ?? []).map((r: any) => Number(r.story_id)));

  return rows.map((row: any) => {
    const authorUserId = String(row.author_user_id);
    const profile = profileMap.get(authorUserId);
    const authorProfile: SocialAuthorProfile = {
      ...buildSocialAuthorProfile(authorUserId, profile),
      isFollowing: false,
      isSelf: authorUserId === userId,
    };

    return {
      id: Number(row.id),
      authorUserId,
      authorProfile,
      contentType: row.content_type as SocialStoryContentType,
      mediaUrl: buildStoryMediaUrl(row.media_path),
      text: row.text ?? null,
      textColor: row.text_color ?? null,
      bgColor: row.bg_color ?? null,
      recoverySnapshot: row.recovery_snapshot ?? null,
      expiresAt: String(row.expires_at),
      createdAt: String(row.created_at),
      viewCount: Number(row.view_count ?? 0),
      isViewed: viewedIds.has(Number(row.id)),
    } satisfies SocialStory;
  });
}

// GET /api/social/stories — 팔로우/친구/본인의 활성 스토리 목록
export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const admin = getSupabaseAdmin();

  try {
    await assertSocialReadAccess(admin, userId);
    // 팔로우, 친구, 본인의 user_id 집합
    const [followRows, connectionRows] = await Promise.all([
      (admin as any)
        .from("rnest_social_follows")
        .select("followee_user_id")
        .eq("follower_user_id", userId),
      (admin as any)
        .from("rnest_connections")
        .select("requester_id, receiver_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`),
    ]);

    const authorIds = new Set<string>([userId]);
    for (const r of followRows.data ?? []) authorIds.add(String(r.followee_user_id));
    for (const r of connectionRows.data ?? []) {
      authorIds.add(String(r.requester_id));
      authorIds.add(String(r.receiver_id));
    }

    const { data: storyRows, error } = await (admin as any)
      .from("rnest_social_stories")
      .select("id, author_user_id, content_type, media_path, text, text_color, bg_color, recovery_snapshot, expires_at, view_count, created_at")
      .in("author_user_id", Array.from(authorIds))
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    const stories = await hydrateStories(admin, userId, storyRows ?? []);
    return jsonNoStore({ ok: true, data: { stories } });
  } catch (err: any) {
    const accessCode = getSocialAccessErrorCode(err);
    if (accessCode) return jsonNoStore({ ok: false, error: accessCode }, { status: 403 });
    console.error("[Stories/GET] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_load_stories" }, { status: 500 });
  }
}

// POST /api/social/stories — 스토리 생성
export async function POST(req: Request) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const adminDb = getSupabaseAdmin();
  const { data: profileCheck } = await (adminDb as any)
    .from("rnest_social_profiles")
    .select("is_suspended")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileCheck?.is_suspended) {
    return jsonNoStore({ ok: false, error: "account_suspended" }, { status: 403 });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const contentType: SocialStoryContentType =
    body?.contentType === "image" ? "image"
    : body?.contentType === "recovery" ? "recovery"
    : "text";

  const text =
    typeof body?.text === "string"
      ? Array.from(body.text).slice(0, 200).join("").trim()
      : null;

  const textColor = typeof body?.textColor === "string" ? body.textColor.slice(0, 16) : null;
  const bgColor = typeof body?.bgColor === "string" ? body.bgColor.slice(0, 16) : null;
  const mediaPath = contentType === "image" && typeof body?.mediaPath === "string" ? body.mediaPath.slice(0, 500) : null;

  const rawRecovery = body?.recoverySnapshot;
  const recoverySnapshot =
    contentType === "recovery" && rawRecovery && typeof rawRecovery === "object"
      ? {
          headline: String(rawRecovery.headline ?? "").slice(0, 100),
          batteryAvg: typeof rawRecovery.batteryAvg === "number" ? rawRecovery.batteryAvg : null,
          sleepDebtHours: typeof rawRecovery.sleepDebtHours === "number" ? rawRecovery.sleepDebtHours : null,
          weekDays: typeof rawRecovery.weekDays === "number" ? rawRecovery.weekDays : 7,
        }
      : null;

  if (contentType === "text" && !text) {
    return jsonNoStore({ ok: false, error: "content_required" }, { status: 400 });
  }
  if (contentType === "image" && !mediaPath) {
    return jsonNoStore({ ok: false, error: "media_required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  try {
    await assertSocialWriteAccess(admin, userId);
    const { data, error } = await (admin as any)
      .from("rnest_social_stories")
      .insert({
        author_user_id: userId,
        content_type: contentType,
        media_path: mediaPath,
        text,
        text_color: textColor,
        bg_color: bgColor,
        recovery_snapshot: recoverySnapshot,
      })
      .select("id, author_user_id, content_type, media_path, text, text_color, bg_color, recovery_snapshot, expires_at, view_count, created_at")
      .single();

    if (error) throw error;
    const stories = await hydrateStories(admin, userId, [data]);
    return jsonNoStore({ ok: true, data: { story: stories[0] } }, { status: 201 });
  } catch (err: any) {
    const accessCode = getSocialAccessErrorCode(err);
    if (accessCode) return jsonNoStore({ ok: false, error: accessCode }, { status: 403 });
    console.error("[Stories/POST] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_create_story" }, { status: 500 });
  }
}

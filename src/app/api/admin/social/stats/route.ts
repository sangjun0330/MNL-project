import { NextResponse } from "next/server";
import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: Request) {
  const auth = await requireBillingAdmin(req);
  if (!auth.ok) return bad(auth.status, auth.error);

  const admin = getSupabaseAdmin();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const [
      usersRes,
      postsRes,
      activeTodayRes,
      likesRes,
      commentsRes,
      newUsersRes,
      suspendedRes,
      storiesRes,
      groupsRes,
    ] = await Promise.all([
      (admin as any).from("rnest_social_profiles").select("*", { count: "exact", head: true }),
      (admin as any).from("rnest_social_posts").select("*", { count: "exact", head: true }),
      (admin as any)
        .from("rnest_social_profiles")
        .select("*", { count: "exact", head: true })
        .gte("updated_at", todayStart),
      (admin as any).from("rnest_social_post_likes").select("*", { count: "exact", head: true }),
      (admin as any).from("rnest_social_post_comments").select("*", { count: "exact", head: true }),
      (admin as any)
        .from("rnest_social_profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", weekAgo),
      (admin as any)
        .from("rnest_social_profiles")
        .select("*", { count: "exact", head: true })
        .eq("is_suspended", true),
      (admin as any)
        .from("rnest_social_stories")
        .select("*", { count: "exact", head: true })
        .gt("expires_at", now.toISOString()),
      (admin as any).from("rnest_social_groups").select("*", { count: "exact", head: true }),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        stats: {
          totalUsers: usersRes.count ?? 0,
          totalPosts: postsRes.count ?? 0,
          activeToday: activeTodayRes.count ?? 0,
          totalLikes: likesRes.count ?? 0,
          totalComments: commentsRes.count ?? 0,
          newUsersThisWeek: newUsersRes.count ?? 0,
          suspendedUsers: suspendedRes.count ?? 0,
          activeStories: storiesRes.count ?? 0,
          totalGroups: groupsRes.count ?? 0,
        },
      },
    });
  } catch {
    return bad(500, "failed_to_fetch_social_stats");
  }
}

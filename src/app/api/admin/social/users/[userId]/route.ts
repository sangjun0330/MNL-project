import { NextResponse } from "next/server";
import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await requireBillingAdmin(req);
  if (!auth.ok) return bad(auth.status, auth.error);

  const { userId } = await params;
  const admin = getSupabaseAdmin();

  try {
    const [profileRes, postsRes, groupsRes, followersRes] = await Promise.all([
      (admin as any)
        .from("rnest_social_profiles")
        .select(
          "user_id, nickname, handle, display_name, avatar_emoji, account_visibility, is_suspended, suspended_at, suspended_by, suspension_reason, created_at",
        )
        .eq("user_id", userId)
        .maybeSingle(),
      (admin as any)
        .from("rnest_social_posts")
        .select("*", { count: "exact", head: true })
        .eq("author_user_id", userId),
      (admin as any)
        .from("rnest_social_group_members")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId),
      (admin as any)
        .from("rnest_connections")
        .select("*", { count: "exact", head: true })
        .eq("receiver_id", userId)
        .eq("status", "accepted"),
    ]);

    if (!profileRes.data) return bad(404, "user_not_found");

    const row = profileRes.data;
    return NextResponse.json({
      ok: true,
      data: {
        user: {
          userId: String(row.user_id),
          nickname: String(row.nickname ?? ""),
          handle: String(row.handle ?? ""),
          displayName: String(row.display_name ?? ""),
          avatarEmoji: String(row.avatar_emoji ?? "👤"),
          accountVisibility: String(row.account_visibility ?? "public"),
          isSuspended: Boolean(row.is_suspended),
          suspendedAt: row.suspended_at ?? null,
          suspendedBy: row.suspended_by ?? null,
          suspensionReason: row.suspension_reason ?? null,
          createdAt: String(row.created_at ?? ""),
          postCount: postsRes.count ?? 0,
          groupCount: groupsRes.count ?? 0,
          followerCount: followersRes.count ?? 0,
        },
      },
    });
  } catch {
    return bad(500, "failed_to_get_social_user");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await requireBillingAdmin(req);
  if (!auth.ok) return bad(auth.status, auth.error);

  const { userId } = await params;

  let body: { action?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return bad(400, "invalid_body");
  }

  const { action, reason } = body;
  if (action !== "suspend" && action !== "unsuspend") {
    return bad(400, "invalid_action");
  }

  const admin = getSupabaseAdmin();

  try {
    const update =
      action === "suspend"
        ? {
            is_suspended: true,
            suspended_at: new Date().toISOString(),
            suspended_by: auth.identity.userId,
            suspension_reason: reason ? String(reason).slice(0, 200) : null,
          }
        : {
            is_suspended: false,
            suspended_at: null,
            suspended_by: null,
            suspension_reason: null,
          };

    const { error } = await (admin as any)
      .from("rnest_social_profiles")
      .update(update)
      .eq("user_id", userId);

    if (error) throw error;

    console.warn(
      `[SocialAdmin] ${action} user=${userId.slice(0, 8)}… by admin=${auth.identity.userId.slice(0, 8)}… ts=${new Date().toISOString()}`,
    );

    return NextResponse.json({ ok: true });
  } catch {
    return bad(500, "failed_to_update_social_user");
  }
}

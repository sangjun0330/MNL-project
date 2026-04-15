import { NextResponse } from "next/server";
import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const auth = await requireBillingAdmin(req);
  if (!auth.ok) return bad(auth.status, auth.error);

  const { groupId } = await params;
  const id = Number(groupId);
  if (!Number.isFinite(id) || id <= 0) return bad(400, "invalid_group_id");

  const admin = getSupabaseAdmin();

  try {
    const { error } = await (admin as any)
      .from("rnest_social_groups")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch {
    return bad(500, "failed_to_delete_social_group");
  }
}

// 그룹 멤버 목록 조회
export async function GET(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const auth = await requireBillingAdmin(req);
  if (!auth.ok) return bad(auth.status, auth.error);

  const { groupId } = await params;
  const id = Number(groupId);
  if (!Number.isFinite(id) || id <= 0) return bad(400, "invalid_group_id");

  const admin = getSupabaseAdmin();

  try {
    const { data: memberRows, error } = await (admin as any)
      .from("rnest_social_group_members")
      .select("user_id, role, joined_at")
      .eq("group_id", id)
      .order("joined_at", { ascending: true });

    if (error) throw error;

    const rows = (memberRows as any[]) ?? [];
    const memberIds = rows.map((r) => String(r.user_id));
    const profileMap: Record<string, { nickname: string; handle: string; avatarEmoji: string }> = {};

    if (memberIds.length > 0) {
      const { data: profiles } = await (admin as any)
        .from("rnest_social_profiles")
        .select("user_id, nickname, handle, avatar_emoji")
        .in("user_id", memberIds);

      for (const p of (profiles as any[]) ?? []) {
        profileMap[String(p.user_id)] = {
          nickname: String(p.nickname ?? ""),
          handle: String(p.handle ?? ""),
          avatarEmoji: String(p.avatar_emoji ?? "👤"),
        };
      }
    }

    const members = rows.map((row) => {
      const profile = profileMap[String(row.user_id)] ?? { nickname: "", handle: "", avatarEmoji: "👤" };
      return {
        userId: String(row.user_id),
        nickname: profile.nickname,
        handle: profile.handle,
        avatarEmoji: profile.avatarEmoji,
        role: String(row.role ?? "member"),
        joinedAt: String(row.joined_at ?? ""),
      };
    });

    return NextResponse.json({ ok: true, data: { members } });
  } catch {
    return bad(500, "failed_to_get_group_members");
  }
}

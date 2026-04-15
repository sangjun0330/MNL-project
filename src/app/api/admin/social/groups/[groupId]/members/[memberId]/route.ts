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
  { params }: { params: Promise<{ groupId: string; memberId: string }> },
) {
  const auth = await requireBillingAdmin(req);
  if (!auth.ok) return bad(auth.status, auth.error);

  const { groupId, memberId } = await params;
  const gid = Number(groupId);
  if (!Number.isFinite(gid) || gid <= 0) return bad(400, "invalid_group_id");

  const admin = getSupabaseAdmin();

  try {
    // 오너 여부 확인 — 오너는 강제 퇴장 불가
    const { data: memberRow } = await (admin as any)
      .from("rnest_social_group_members")
      .select("role")
      .eq("group_id", gid)
      .eq("user_id", memberId)
      .maybeSingle();

    if (!memberRow) return bad(404, "member_not_found");
    if (memberRow.role === "owner") {
      return NextResponse.json(
        { ok: false, error: "cannot_remove_owner" },
        { status: 400 },
      );
    }

    const { error } = await (admin as any)
      .from("rnest_social_group_members")
      .delete()
      .eq("group_id", gid)
      .eq("user_id", memberId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch {
    return bad(500, "failed_to_remove_group_member");
  }
}

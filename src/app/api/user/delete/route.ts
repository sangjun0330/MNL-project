import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { readUserIdFromRequest } from "@/lib/server/readUserId";

export const runtime = "edge";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function DELETE(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return bad(401, "login required");

  const admin = getSupabaseAdmin();

  try {
    // 사용자 데이터 삭제
    await admin.from("wnl_daily_logs").delete().eq("device_id", userId);
    await admin.from("wnl_user_state").delete().eq("user_id", userId);
    await admin.from("wnl_users").delete().eq("user_id", userId);

    // Auth 유저 삭제
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return bad(500, error.message);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return bad(500, e?.message || "failed to delete user");
  }
}

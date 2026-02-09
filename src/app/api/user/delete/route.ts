import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { readUserIdFromRequest } from "@/lib/server/readUserId";

export const runtime = "edge";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function DELETE(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return bad(401, "Login required.");

  const admin = getSupabaseAdmin();

  try {
    // 1. ai_content (AI 회복 캐시)
    const aiContentDelete = await admin.from("ai_content").delete().eq("user_id", userId);
    if (aiContentDelete.error) {
      return bad(500, `Failed to delete AI content: ${aiContentDelete.error.message}`);
    }

    // 2. wnl_user_state (사용자 상태 데이터)
    const userStateDelete = await admin.from("wnl_user_state").delete().eq("user_id", userId);
    if (userStateDelete.error) {
      return bad(500, `Failed to delete user state: ${userStateDelete.error.message}`);
    }

    // 3. wnl_users (사용자 프로필)
    const usersDelete = await admin.from("wnl_users").delete().eq("user_id", userId);
    if (usersDelete.error) {
      return bad(500, `Failed to delete user profile: ${usersDelete.error.message}`);
    }

    // 4. Supabase Auth 유저 삭제
    const authDelete = await admin.auth.admin.deleteUser(userId);
    if (authDelete.error) {
      return bad(500, `Failed to delete auth user: ${authDelete.error.message}`);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return bad(500, e?.message || "Failed to delete account.");
  }
}

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
      return bad(500, "failed_to_delete_account");
    }

    // 2. rnest_user_state (사용자 상태 데이터)
    const userStateDelete = await admin.from("rnest_user_state").delete().eq("user_id", userId);
    if (userStateDelete.error) {
      return bad(500, "failed_to_delete_account");
    }

    // 3. rnest_users (사용자 프로필)
    const usersDelete = await admin.from("rnest_users").delete().eq("user_id", userId);
    if (usersDelete.error) {
      return bad(500, "failed_to_delete_account");
    }

    // 4. Supabase Auth 유저 삭제
    const authDelete = await admin.auth.admin.deleteUser(userId);
    if (authDelete.error) {
      return bad(500, "failed_to_delete_account");
    }

    return NextResponse.json({ ok: true });
  } catch {
    return bad(500, "failed_to_delete_account");
  }
}

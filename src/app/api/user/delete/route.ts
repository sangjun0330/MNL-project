import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function DELETE() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnon) {
    return bad(500, "supabase env missing");
  }
  if (!serviceKey) {
    return bad(500, "SUPABASE_SERVICE_ROLE_KEY missing");
  }

  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: async () => cookieStore });
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id ?? "";
  if (!userId) return bad(401, "login required");

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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

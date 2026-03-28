import { NextResponse } from "next/server";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getRouteSupabaseClient } from "@/lib/server/supabaseRouteClient";
import { jsonNoStore } from "@/lib/server/requestSecurity";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) {
    // ⚠️ signOut()을 여기서 호출하지 않는다.
    // 세션 확인 실패(만료 토큰, 네트워크 오류, 토큰 갱신 타이밍 등)가
    // 반드시 "의도적 로그아웃"을 뜻하지 않으므로, 쿠키를 서버에서 파괴하면
    // TOKEN_REFRESHED 이후 갱신된 세션도 사라져 버린다.
    // 로그아웃 결정은 클라이언트(auth.ts)가 내려야 한다.
    return jsonNoStore({ ok: true, authenticated: false, userId: null });
  }
  return jsonNoStore({ ok: true, authenticated: true, userId });
}

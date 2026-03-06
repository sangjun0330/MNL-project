/**
 * 🛠️ 개발 전용 빠른 로그인 라우트
 *
 * ⚠️  NODE_ENV !== 'development' 시 완전 비활성화 (404 반환)
 *
 * 사용법:
 *   브라우저에서 http://localhost:3000/api/dev/login?user=1 접속
 *   → .env.local의 DEV_USER_1_EMAIL / DEV_USER_1_PASSWORD 계정으로 자동 로그인
 *   → /schedule 페이지로 리다이렉트
 *
 *   두 번째 계정: ?user=2  (incognito 창에서 테스트)
 *   로그아웃:    ?logout=1
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const runtime = "nodejs"; // cookies() 쓰기 지원을 위해 nodejs 사용
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // ── 프로덕션 완전 차단 ─────────────────────────────────────
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const url = new URL(req.url);
  const userIdx = url.searchParams.get("user") ?? "1";
  const logout = url.searchParams.get("logout");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  if (!supabaseUrl || !supabaseAnon) {
    return new NextResponse("Supabase env missing", { status: 500 });
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      get: (name) => cookieStore.get(name)?.value ?? null,
      set: (name, value, options) => {
        const store: any = cookieStore;
        if (typeof store.set === "function") store.set({ name, value, ...options });
      },
      remove: (name, options) => {
        const store: any = cookieStore;
        if (typeof store.set === "function") store.set({ name, value: "", ...options });
      },
    },
  });

  // ── 로그아웃 ────────────────────────────────────────────────
  if (logout === "1") {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/schedule", req.url));
  }

  // ── 유저별 이메일/비밀번호 ──────────────────────────────────
  const email =
    userIdx === "2"
      ? process.env.DEV_USER_2_EMAIL
      : process.env.DEV_USER_1_EMAIL;
  const password =
    userIdx === "2"
      ? process.env.DEV_USER_2_PASSWORD
      : process.env.DEV_USER_1_PASSWORD;

  if (!email || !password) {
    return new NextResponse(
      `
      <html><body style="font-family:monospace;padding:32px;background:#f9f9f9">
        <h2>🛠️ Dev Login — 계정 미설정</h2>
        <p>.env.local에 추가하세요:</p>
        <pre style="background:#eee;padding:16px;border-radius:8px">
DEV_USER_1_EMAIL=test1@example.com
DEV_USER_1_PASSWORD=testpassword123
DEV_USER_2_EMAIL=test2@example.com
DEV_USER_2_PASSWORD=testpassword123
        </pre>
        <p>그다음 Supabase Dashboard → Authentication → Users 에서 계정을 생성하세요.</p>
        <p><a href="https://supabase.com/dashboard">Supabase Dashboard 열기 →</a></p>
      </body></html>
      `,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // ── 로그인 시도 ──────────────────────────────────────────────
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return new NextResponse(
      `
      <html><body style="font-family:monospace;padding:32px;background:#fff0f0">
        <h2>🔴 로그인 실패</h2>
        <p><b>${error?.message ?? "Unknown error"}</b></p>
        <p>Supabase Dashboard에서 계정이 존재하는지 확인하세요:</p>
        <p>Authentication → Users → "Add user" → Create new user</p>
        <p>Email 인증이 활성화되어 있어야 합니다:</p>
        <p>Authentication → Providers → Email → Enable</p>
      </body></html>
      `,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // ── 성공 → 일정 페이지로 ─────────────────────────────────────
  const redirectTo = url.searchParams.get("redirect") ?? "/schedule";
  const res = NextResponse.redirect(new URL(redirectTo, req.url));
  return res;
}

"use client";

import { Button } from "@/components/ui/Button";
import { signInWithProvider, signOut, useAuthState } from "@/lib/auth";

function providerLabel(provider: string | null | undefined) {
  if (provider === "google") return "Google";
  if (provider === "kakao") return "Kakao";
  return "알 수 없음";
}

export function SettingsPage() {
  const { user: auth, status } = useAuthState();
  const isLoading = status === "loading";

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 pt-6">
      <div className="mb-4">
        <div className="text-[28px] font-extrabold tracking-[-0.02em]">설정</div>
        <div className="mt-1 text-[13px] text-ios-sub">
          모든 기능을 사용하려면 로그인해야 합니다.
        </div>
      </div>

      <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-ios-muted">
        소셜 로그인
      </div>
      <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
        <div className="text-[15px] font-bold text-ios-text">소셜 로그인</div>

        {auth ? (
          <div className="mt-4 space-y-3 text-[14px] text-ios-text">
            <div className="flex items-center justify-between">
              <span className="text-ios-sub">로그인 방식</span>
              <span className="font-semibold">{providerLabel(auth.provider)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ios-sub">계정 이메일</span>
              <span className="font-semibold">{auth.email ?? "알 수 없음"}</span>
            </div>
            <div className="rounded-2xl bg-black/[0.04] px-3 py-2 text-[12px] text-ios-sub">
              로그인된 계정에 기록이 안전하게 저장됩니다.
            </div>
            <div className="pt-2">
              <Button variant="secondary" onClick={() => signOut()}>
                로그아웃
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="text-[13px] text-ios-sub">
              Google · Kakao 계정으로 로그인하면 기록이 계정에 저장되어 앱을 지우거나
              기기를 바꿔도 복원할 수 있습니다.
            </div>

            <div className="grid gap-2">
              <Button onClick={() => signInWithProvider("google")} disabled={isLoading}>
                Google로 계속
              </Button>
              <Button
                variant="secondary"
                onClick={() => signInWithProvider("kakao")}
                disabled={isLoading}
              >
                Kakao로 계속
              </Button>
            </div>
            <div className="text-[12px] text-ios-muted">
              {isLoading
                ? "로그인 상태를 확인 중이에요."
                : "로그인 후 모든 기능(일정, 기록, 인사이트)을 사용할 수 있어요."}
            </div>
            <div className="text-[12px] text-ios-muted">
              Kakao 로그인은 설정된 리디렉션 URI와 도메인이 일치해야 합니다.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SettingsPage;

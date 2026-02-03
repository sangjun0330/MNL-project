"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BottomNav } from "@/components/shell/BottomNav";
import { AutoHealthLogger } from "@/components/system/AutoHealthLogger";
import { CloudStateSync } from "@/components/system/CloudStateSync";
import { useAuthState } from "@/lib/auth";
import { hydrateState, purgeAllLocalState, purgeAllLocalStateIfNeeded, setLocalSaveEnabled, setStorageScope } from "@/lib/store";
import { emptyState } from "@/lib/model";
import { useEffect, useState } from "react";

function LoginGate() {
  return (
    <div className="mx-auto mt-10 max-w-[520px] rounded-apple border border-ios-sep bg-white p-6 shadow-apple">
      <div className="text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">로그인이 필요해요</div>
      <div className="mt-2 text-[13px] text-ios-sub">
        모든 기능을 사용하려면 로그인해야 합니다. 로그인하면 기록이 계정에 안전하게 저장됩니다.
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link
          href="/settings"
          className="inline-flex h-10 items-center justify-center rounded-full bg-black px-4 text-[13px] font-semibold text-white"
        >
          설정에서 로그인하기
        </Link>
        <div className="text-[12px] text-ios-muted">Google · Kakao 로그인 지원</div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user: auth, status } = useAuthState();
  const isAuthed = Boolean(auth?.userId);
  const allowPrompt = !isAuthed && status !== "loading" && !pathname?.startsWith("/settings");
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);

  useEffect(() => {
    // ✅ 로컬 저장 완전 비활성화 + 로컬 데이터 즉시 삭제
    setLocalSaveEnabled(false);
    purgeAllLocalState();
    purgeAllLocalStateIfNeeded();
  }, []);

  useEffect(() => {
    const uid = auth?.userId ?? null;
    if (!uid) {
      purgeAllLocalState();
      setLocalSaveEnabled(false);
      setStorageScope(null);
      hydrateState(emptyState());
      return;
    }
    // 로그인해도 로컬 저장은 사용하지 않음 (서버 저장만 사용)
    setLocalSaveEnabled(false);
    setStorageScope(uid);
  }, [auth?.userId]);

  useEffect(() => {
    if (!loginPromptOpen) return;
    const t = window.setTimeout(() => {
      router.push("/settings");
    }, 900);
    return () => window.clearTimeout(t);
  }, [loginPromptOpen, router]);

  return (
    <div className="min-h-dvh w-full bg-ios-bg">
      <div className="safe-top" />
      {/* 하단 네비게이션/홈 인디케이터에 컨텐츠가 가리지 않도록 safe-area 패딩을 추가 */}
      {/*
        캘린더/차트가 너무 작게 보인다는 피드백 반영:
        - 데스크탑/태블릿에서 더 넓게 보이도록 컨테이너 폭 확장
        - 모바일은 여전히 자연스럽게 full width
      */}
      <div
        className="mx-auto max-w-[720px] px-4 pb-[calc(96px+env(safe-area-inset-bottom))]"
        onPointerDownCapture={(event) => {
          if (!allowPrompt) return;
          event.preventDefault();
          event.stopPropagation();
          setLoginPromptOpen(true);
        }}
        onKeyDownCapture={(event) => {
          if (!allowPrompt) return;
          event.preventDefault();
          event.stopPropagation();
          setLoginPromptOpen(true);
        }}
      >
        <div key={pathname} className="wnl-page-enter">
          {children}
        </div>
      </div>
      {allowPrompt && loginPromptOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-[360px] rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
            <div className="text-[16px] font-bold text-ios-text">로그인이 필요해요</div>
            <div className="mt-2 text-[13px] text-ios-sub">
              로그인 후에 모든 기능을 사용할 수 있어요. 설정으로 이동합니다.
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="h-9 rounded-full bg-black px-4 text-[12px] font-semibold text-white"
                onClick={() => router.push("/settings")}
              >
                설정으로 이동
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {allowPrompt && !loginPromptOpen ? <LoginGate /> : null}
      {isAuthed ? <CloudStateSync /> : null}
      {/* 자동 건강 기록/동기화(백그라운드): 매일/실시간 스냅샷 저장 */}
      {isAuthed ? <AutoHealthLogger userId={auth?.userId} /> : null}
      <div className="safe-bottom" />
      <BottomNav />
    </div>
  );
}

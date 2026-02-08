"use client";

import { usePathname, useRouter } from "next/navigation";
import { BottomNav } from "@/components/shell/BottomNav";
import { UiPreferencesBridge } from "@/components/system/UiPreferencesBridge";
import { CloudStateSync } from "@/components/system/CloudStateSync";
import { getSupabaseBrowserClient, useAuthState } from "@/lib/auth";
import { hydrateState, setLocalSaveEnabled, setStorageScope, useAppStoreSelector } from "@/lib/store";
import { emptyState } from "@/lib/model";
import { useI18n } from "@/lib/useI18n";
import { OnboardingGuide } from "@/components/system/OnboardingGuide";
import type { SyntheticEvent } from "react";
import { useCallback, useEffect, useState } from "react";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const { user: auth, status } = useAuthState();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const isAuthed = Boolean(auth?.userId) || hasSession === true;
  const [cloudReady, setCloudReady] = useState(false);
  const allowPrompt = !isAuthed && status === "unauthenticated" && !pathname?.startsWith("/settings");
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const goToSettings = useCallback(() => {
    setLoginPromptOpen(false);
    if (!pathname?.startsWith("/settings")) {
      router.push("/settings");
    }
  }, [router, pathname]);

  useEffect(() => {
    // ✅ 로컬 저장 비활성: Supabase만 사용
    setLocalSaveEnabled(false);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setHasSession(Boolean(data.session));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setHasSession(Boolean(nextSession));
    });
    return () => {
      active = false;
      data.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthed) {
      setCloudReady(false);
      return;
    }
    if (typeof window !== "undefined") {
      const cachedReadyUserId = (window as any).__wnlCloudReadyUserId as string | undefined;
      if (cachedReadyUserId && (!auth?.userId || cachedReadyUserId === auth.userId)) {
        setCloudReady(true);
      }
    }
    const onReady = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail?.userId || !auth?.userId || detail.userId === auth?.userId) {
        setCloudReady(true);
      }
    };
    window.addEventListener("wnl:cloud-ready", onReady);
    return () => window.removeEventListener("wnl:cloud-ready", onReady);
  }, [isAuthed, auth?.userId]);

  useEffect(() => {
    if (!isAuthed || cloudReady) return;
    const timer = window.setTimeout(() => {
      setCloudReady(true);
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [isAuthed, cloudReady]);

  useEffect(() => {
    if (status === "loading") return;
    const uid = auth?.userId ?? null;
    setLocalSaveEnabled(false);
    setStorageScope(uid ?? null);
  }, [auth?.userId, status]);

  useEffect(() => {
    const onAuthEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail as { event?: string };
      if (detail?.event === "SIGNED_OUT") {
        hydrateState(emptyState());
        setCloudReady(false);
      }
    };
    window.addEventListener("wnl:auth-event", onAuthEvent);
    return () => window.removeEventListener("wnl:auth-event", onAuthEvent);
  }, []);

  useEffect(() => {
    if (!allowPrompt && loginPromptOpen) {
      setLoginPromptOpen(false);
    }
  }, [allowPrompt, loginPromptOpen]);

  useEffect(() => {
    if (!loginPromptOpen) return;
    if (isAuthed || pathname?.startsWith("/settings")) {
      setLoginPromptOpen(false);
    }
  }, [loginPromptOpen, isAuthed, pathname]);

  const shouldBlockInteraction = useCallback((target: EventTarget | null) => {
    if (!allowPrompt) return false;
    if (!(target instanceof Element)) return false;
    if (target.closest("[data-auth-modal]")) return false;
    if (target.closest("[data-auth-allow]")) return false;
    if (target.closest("a[href]")) return false;
    const interactive = target.closest("button, input, textarea, select, [role='button']");
    return Boolean(interactive);
  }, [allowPrompt]);

  const handleGuardedInteraction = useCallback((event: SyntheticEvent) => {
    if (!shouldBlockInteraction(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    setLoginPromptOpen(true);
  }, [shouldBlockInteraction]);

  // Onboarding
  const { hasSeenOnboarding, setSettings } = useAppStoreSelector(
    (s) => ({ hasSeenOnboarding: s.settings.hasSeenOnboarding, setSettings: s.setSettings }),
    (a, b) => a.hasSeenOnboarding === b.hasSeenOnboarding && a.setSettings === b.setSettings
  );
  const showOnboarding = isAuthed && cloudReady && !hasSeenOnboarding;
  const handleOnboardingComplete = useCallback(() => {
    setSettings({ hasSeenOnboarding: true });
  }, [setSettings]);

  return (
    <div className="min-h-dvh w-full bg-ios-bg">
      <UiPreferencesBridge />
      <div className="safe-top" />
      {/* 하단 네비게이션/홈 인디케이터에 컨텐츠가 가리지 않도록 safe-area 패딩을 추가 */}
      {/*
        캘린더/차트가 너무 작게 보인다는 피드백 반영:
        - 데스크탑/태블릿에서 더 넓게 보이도록 컨테이너 폭 확장
        - 모바일은 여전히 자연스럽게 full width
      */}
      <div
        className="mx-auto max-w-[720px] px-4 pb-[calc(96px+env(safe-area-inset-bottom))]"
        onPointerDownCapture={handleGuardedInteraction}
        onKeyDownCapture={handleGuardedInteraction}
      >
        <div key={pathname} className="wnl-page-enter">
          {children}
        </div>
      </div>
      {allowPrompt && loginPromptOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6 wnl-backdrop" data-auth-modal>
          <div className="w-full max-w-[360px] rounded-apple border border-ios-sep bg-white p-5 shadow-apple wnl-modal" data-auth-modal>
            <div className="text-[16px] font-bold text-ios-text">{t("로그인이 필요해요")}</div>
            <div className="mt-2 text-[13px] text-ios-sub">
              {t("모든 기능을 사용하려면 로그인해야 합니다. 설정으로 이동해 주세요.")}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="h-9 rounded-full bg-black px-4 text-[12px] font-semibold text-white"
                onClick={goToSettings}
                data-auth-allow
              >
                {t("설정으로 이동")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {isAuthed && !cloudReady ? (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-white/70 backdrop-blur-sm px-6 wnl-backdrop">
          <div className="w-full max-w-[320px] rounded-apple border border-ios-sep bg-white p-5 shadow-apple wnl-modal">
            <div className="text-[15px] font-semibold text-ios-text">{t("데이터 동기화 중…")}</div>
            <div className="mt-2 text-[12.5px] text-ios-sub">{t("로그인 데이터를 불러오는 중입니다.")}</div>
          </div>
        </div>
      ) : null}
      {isAuthed ? <CloudStateSync /> : null}
      <OnboardingGuide open={showOnboarding} onComplete={handleOnboardingComplete} />
      <div className="safe-bottom" />
      <BottomNav />
    </div>
  );
}

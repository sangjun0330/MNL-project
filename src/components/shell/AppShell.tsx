"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BottomNav } from "@/components/shell/BottomNav";
import { UiPreferencesBridge } from "@/components/system/UiPreferencesBridge";
import { getSupabaseBrowserClient, signOut, useAuthState } from "@/lib/auth";
import { readPreferredAppStateDraft } from "@/lib/appStateDraft";
import { hydrateState } from "@/lib/store";
import { emptyState } from "@/lib/model";
import { useI18n } from "@/lib/useI18n";
import type { SyntheticEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CloudStateSync = dynamic(
  () => import("@/components/system/CloudStateSync").then((mod) => mod.CloudStateSync),
  { ssr: false }
);

const CloudNotebookSync = dynamic(
  () => import("@/components/system/CloudNotebookSync").then((mod) => mod.CloudNotebookSync),
  { ssr: false }
);

const OnboardingGuide = dynamic(
  () => import("@/components/system/OnboardingGuide").then((mod) => mod.OnboardingGuide),
  { ssr: false }
);

const ServiceConsentScreen = dynamic(
  () => import("@/components/system/ServiceConsentScreen").then((mod) => mod.ServiceConsentScreen),
  { ssr: false }
);

const AUTH_INTERACTION_GUARD_ENABLED =
  process.env.NEXT_PUBLIC_AUTH_INTERACTION_GUARD_ENABLED !== "false";

type BootstrapPayload = {
  onboardingCompleted: boolean;
  consentCompleted: boolean;
  hasStoredState: boolean;
  state: any | null;
  updatedAt: number | null;
};

type BusyStage = "onboarding" | null;

let bootstrapCache: {
  userId: string;
  payload: BootstrapPayload;
} | null = null;

function readBootstrapCache(userId?: string | null) {
  if (!userId) return null;
  if (bootstrapCache?.userId !== userId) return null;
  return bootstrapCache.payload;
}

function writeBootstrapCache(userId: string, payload: BootstrapPayload) {
  bootstrapCache = { userId, payload };
}

function clearBootstrapCache(userId?: string | null) {
  if (!userId || bootstrapCache?.userId === userId) {
    bootstrapCache = null;
  }
}

function GateLoadingScreen({ message, detail }: { message: string; detail: string }) {
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-white/86 px-6 backdrop-blur-sm">
      <div className="w-full max-w-[360px] rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
        <div className="text-[15px] font-semibold text-ios-text">{message}</div>
        <div className="mt-2 text-[12.5px] text-ios-sub">{detail}</div>
      </div>
    </div>
  );
}

function GateErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="fixed inset-0 z-[105] overflow-y-auto bg-white">
      <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col justify-center px-5 py-10">
        <div className="rounded-[28px] border border-[#E7EDF5] bg-[linear-gradient(180deg,#F8FBFF_0%,#FFFFFF_100%)] px-5 py-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <div className="text-[28px] font-extrabold tracking-[-0.03em] text-[#10243E]">
            시작 준비 중 문제가 발생했어요
          </div>
          <div className="mt-3 text-[14px] leading-6 text-[#49617A]">
            계정 상태를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-11 items-center justify-center rounded-full bg-[#10243E] px-5 text-[14px] font-semibold text-white"
            >
              다시 시도
            </button>
            <Link
              href="/terms"
              className="inline-flex h-11 items-center justify-center rounded-full border border-[#D7E4F3] bg-[#EEF5FF] px-5 text-[14px] font-semibold text-[#24507A]"
            >
              이용약관
            </Link>
            <Link
              href="/privacy"
              className="inline-flex h-11 items-center justify-center rounded-full border border-[#D7E4F3] bg-[#EEF5FF] px-5 text-[14px] font-semibold text-[#24507A]"
            >
              개인정보처리방침
            </Link>
            <button
              type="button"
              onClick={() => signOut()}
              className="inline-flex h-11 items-center justify-center rounded-full border border-[#E7EDF5] bg-white px-5 text-[14px] font-semibold text-[#10243E]"
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const { user: auth, status } = useAuthState();
  const isAuthed = Boolean(auth?.userId);
  const isMedSafetyImmersive = pathname === "/tools/med-safety";
  const isNotebookImmersive = pathname === "/tools/notebook";
  const isPolicyPage = pathname?.startsWith("/privacy") || pathname?.startsWith("/terms");
  const allowPrompt =
    AUTH_INTERACTION_GUARD_ENABLED &&
    !isAuthed &&
    status === "unauthenticated" &&
    !pathname?.startsWith("/settings");
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapSettledUserId, setBootstrapSettledUserId] = useState<string | null>(null);
  const [busyStage, setBusyStage] = useState<BusyStage>(null);
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const bootstrapRequestRef = useRef(0);
  const cachedBootstrap = readBootstrapCache(auth?.userId ?? null);
  const resolvedBootstrap = bootstrap ?? cachedBootstrap;
  const goToSettings = useCallback(() => {
    setLoginPromptOpen(false);
    if (!pathname?.startsWith("/settings")) {
      router.push("/settings");
    }
  }, [router, pathname]);

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  }, [supabase]);

  const loadBootstrap = useCallback(async (options?: { silent?: boolean }) => {
    if (!auth?.userId) return null;
    const scopedUserId = auth.userId;
    const requestId = ++bootstrapRequestRef.current;
    const silent = options?.silent === true;
    if (!silent) {
      setBootstrapLoading(true);
    }
    setBootstrapError(null);

    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/user/bootstrap", {
        method: "GET",
        headers: {
          "content-type": "application/json",
          ...authHeaders,
        },
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(String(json?.error ?? "failed_to_load_bootstrap"));
      }

      const data = (json?.data ?? null) as BootstrapPayload | null;
      if (!data || requestId !== bootstrapRequestRef.current) return null;
      setBootstrap(data);
      writeBootstrapCache(scopedUserId, data);
      setBootstrapSettledUserId(scopedUserId);
      const localDraft = readPreferredAppStateDraft(scopedUserId);
      if (localDraft && (!data.updatedAt || localDraft.updatedAt > data.updatedAt)) {
        hydrateState(localDraft.state);
      } else {
        hydrateState(data.consentCompleted && data.state ? data.state : emptyState());
      }
      return data;
    } catch (error) {
      if (requestId === bootstrapRequestRef.current) {
        setBootstrapSettledUserId(scopedUserId);
        if (!silent) {
          setBootstrap(null);
          setBootstrapError((error as Error)?.message ?? "failed_to_load_bootstrap");
          const localDraft = readPreferredAppStateDraft(scopedUserId);
          if (localDraft) {
            hydrateState(localDraft.state);
          }
        }
      }
      return null;
    } finally {
      if (requestId === bootstrapRequestRef.current) {
        setBootstrapLoading(false);
      }
    }
  }, [auth?.userId, getAuthHeaders]);

  useEffect(() => {
    if (status === "loading") return;
    if (!auth?.userId) {
      bootstrapRequestRef.current += 1;
      clearBootstrapCache();
      setBootstrap(null);
      setBootstrapLoading(false);
      setBootstrapError(null);
      setBootstrapSettledUserId(null);
      setBusyStage(null);
      hydrateState(emptyState());
      return;
    }
    setBootstrapSettledUserId(null);
    const cached = readBootstrapCache(auth.userId);
    if (cached) {
      setBootstrap(cached);
      setBootstrapError(null);
      const localDraft = readPreferredAppStateDraft(auth.userId);
      if (localDraft && (!cached.updatedAt || localDraft.updatedAt > cached.updatedAt)) {
        hydrateState(localDraft.state);
      } else {
        hydrateState(cached.consentCompleted && cached.state ? cached.state : emptyState());
      }
    } else {
      setBootstrap(null);
      setBootstrapError(null);
      const localDraft = readPreferredAppStateDraft(auth.userId);
      if (localDraft) {
        hydrateState(localDraft.state);
      }
    }
    void loadBootstrap({ silent: Boolean(cached?.consentCompleted) });
  }, [auth?.userId, loadBootstrap, status]);

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

  const hasBootstrap = resolvedBootstrap !== null;
  const showOnboarding =
    isAuthed &&
    !isPolicyPage &&
    hasBootstrap &&
    !bootstrapLoading &&
    !bootstrapError &&
    !resolvedBootstrap?.onboardingCompleted &&
    !resolvedBootstrap?.hasStoredState;

  const showConsent =
    isAuthed &&
    !isPolicyPage &&
    hasBootstrap &&
    !bootstrapLoading &&
    !bootstrapError &&
    !showOnboarding &&
    !resolvedBootstrap?.consentCompleted;

  const canRenderContent = !isAuthed || isPolicyPage || Boolean(resolvedBootstrap?.consentCompleted);
  const showBottomNav = !isNotebookImmersive && (!isAuthed || Boolean(resolvedBootstrap?.consentCompleted));

  const handleOnboardingComplete = useCallback(async () => {
    if (!auth?.userId || busyStage) return;
    setBusyStage("onboarding");
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/user/onboarding/complete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders,
        },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(String(json?.error ?? "failed_to_complete_onboarding"));
      }
      await loadBootstrap();
    } catch (error) {
      setBootstrapError((error as Error)?.message ?? "failed_to_complete_onboarding");
    } finally {
      setBusyStage(null);
    }
  }, [auth?.userId, busyStage, getAuthHeaders, loadBootstrap]);

  const handleConsentComplete = useCallback(
    async (input: { recordsStorage: true; aiUsage: true }) => {
      if (!auth?.userId) return;
      try {
        const authHeaders = await getAuthHeaders();
        const res = await fetch("/api/privacy/consents/complete", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...authHeaders,
          },
          body: JSON.stringify(input),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(String(json?.error ?? "failed_to_save_service_consent"));
        }
        const next = await loadBootstrap();
        if (!next?.consentCompleted) {
          throw new Error("failed_to_confirm_service_consent");
        }
      } catch (error) {
        throw error;
      }
    },
    [auth?.userId, getAuthHeaders, loadBootstrap]
  );

  const loadingCopy = bootstrapLoading
    ? {
        message: "계정 상태를 확인하는 중...",
        detail: "온보딩과 동의 여부를 불러오고 있습니다.",
      }
    : busyStage === "onboarding"
      ? {
          message: "온보딩을 마무리하는 중...",
          detail: "바로 동의 화면으로 이동합니다.",
        }
      : {
          message: t("데이터 동기화 중…"),
          detail: t("로그인 데이터를 불러오는 중입니다."),
        };

  return (
    <div className="min-h-dvh w-full bg-ios-bg">
      <UiPreferencesBridge />
      <div className="safe-top" />
      <div
        className={`mx-auto w-full ${
          isNotebookImmersive ? "max-w-none" : isMedSafetyImmersive ? "max-w-[1180px] px-3 sm:px-5" : "max-w-[720px] px-4"
        } ${isNotebookImmersive ? "pb-0" : isMedSafetyImmersive ? "pb-[calc(24px+env(safe-area-inset-bottom))]" : "pb-[calc(96px+env(safe-area-inset-bottom))]"}`}
        onPointerDownCapture={handleGuardedInteraction}
        onKeyDownCapture={handleGuardedInteraction}
      >
        {canRenderContent ? (
          isMedSafetyImmersive || isNotebookImmersive ? (
            children
          ) : (
            <div key={pathname} className="rnest-page-enter">
              {children}
            </div>
          )
        ) : null}
      </div>
      {allowPrompt && loginPromptOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6 rnest-backdrop" data-auth-modal>
          <div className="w-full max-w-[360px] rounded-apple border border-ios-sep bg-white p-5 shadow-apple rnest-modal" data-auth-modal>
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
      {isAuthed && !isPolicyPage && (busyStage === "onboarding" || (bootstrapLoading && !resolvedBootstrap?.consentCompleted)) ? (
        <GateLoadingScreen
          message={loadingCopy.message}
          detail={loadingCopy.detail}
        />
      ) : null}
      {isAuthed && !isPolicyPage && !bootstrapLoading && bootstrapError && !resolvedBootstrap?.consentCompleted ? (
        <GateErrorScreen onRetry={() => void loadBootstrap()} />
      ) : null}
      {!isPolicyPage ? (
        <CloudStateSync
          remoteEnabled={
            isAuthed &&
            bootstrapSettledUserId === (auth?.userId ?? null) &&
            Boolean(resolvedBootstrap?.consentCompleted)
          }
        />
      ) : null}
      {!isPolicyPage ? <CloudNotebookSync /> : null}
      <OnboardingGuide open={showOnboarding} onComplete={handleOnboardingComplete} />
      {showConsent ? <ServiceConsentScreen onSubmit={handleConsentComplete} /> : null}
      <div className="safe-bottom" />
      {showBottomNav ? <BottomNav /> : null}
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BottomNav } from "@/components/shell/BottomNav";
import { UiPreferencesBridge } from "@/components/system/UiPreferencesBridge";
import { shouldPreferCandidateState } from "@/lib/appStateIntegrity";
import type { BootstrapPayload } from "@/lib/accountBootstrap";
import { getSupabaseBrowserClient, signOut, useAuthState } from "@/lib/auth";
import { hasMeaningfulAppState, readPreferredAppStateDraft } from "@/lib/appStateDraft";
import { beginCurrentAccountSession, resetCurrentAccountResources, setCurrentAccountBootstrap } from "@/lib/currentAccountResourceStore";
import { hydrateEmptyAppState, hydrateState, resetAppStoreForHydration, useAppStoreHydrated } from "@/lib/store";
import { emptyState } from "@/lib/model";
import { useI18n } from "@/lib/useI18n";
import { resetClientSyncSnapshot, updateClientSyncSnapshot } from "@/lib/clientSyncStore";
import type { SyntheticEvent } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

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

const UserStateSyncBridge = dynamic(
  () => import("@/components/system/UserStateSyncBridge").then((mod) => mod.UserStateSyncBridge),
  { ssr: false }
);

const AUTH_INTERACTION_GUARD_ENABLED =
  process.env.NEXT_PUBLIC_AUTH_INTERACTION_GUARD_ENABLED !== "false";

type BusyStage = "onboarding" | "consent" | null;

function normalizeRevision(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBootstrapPayload(value: BootstrapPayload): BootstrapPayload {
  const stateRevision = normalizeRevision(value.stateRevision ?? value.updatedAt);
  const bootstrapRevision = normalizeRevision(value.bootstrapRevision ?? stateRevision);
  return {
    ...value,
    stateRevision,
    bootstrapRevision,
    updatedAt: stateRevision,
  };
}

function shouldAdoptBootstrap(current: BootstrapPayload | null, incoming: BootstrapPayload) {
  if (!current) return true;
  if (current.degraded && !incoming.degraded) return true;
  if (!current.state && incoming.state) return true;
  if (current.onboardingCompleted !== incoming.onboardingCompleted) return true;
  if (current.consentCompleted !== incoming.consentCompleted) return true;

  const currentBootstrapRevision = normalizeRevision(current.bootstrapRevision ?? current.stateRevision ?? current.updatedAt) ?? -1;
  const incomingBootstrapRevision = normalizeRevision(incoming.bootstrapRevision ?? incoming.stateRevision ?? incoming.updatedAt) ?? -1;
  if (incomingBootstrapRevision !== currentBootstrapRevision) {
    return incomingBootstrapRevision > currentBootstrapRevision;
  }

  const currentStateRevision = normalizeRevision(current.stateRevision ?? current.updatedAt) ?? -1;
  const incomingStateRevision = normalizeRevision(incoming.stateRevision ?? incoming.updatedAt) ?? -1;
  if (incomingStateRevision !== currentStateRevision) {
    return incomingStateRevision > currentStateRevision;
  }

  return false;
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

function pickHydrationState(input: {
  localDraft: { updatedAt: number; state: any } | null;
  remoteState: any | null;
  remoteUpdatedAt: number | null;
}) {
  const { localDraft, remoteState, remoteUpdatedAt } = input;
  if (
    localDraft &&
    hasMeaningfulAppState(localDraft.state) &&
    shouldPreferCandidateState(localDraft.state, remoteState, {
      candidateUpdatedAt: localDraft.updatedAt,
      baselineUpdatedAt: remoteUpdatedAt,
    })
  ) {
    return localDraft.state;
  }

  if (remoteState && hasMeaningfulAppState(remoteState)) {
    return remoteState;
  }

  return emptyState();
}

function syncClientRevisionsFromBootstrap(payload: BootstrapPayload | null) {
  if (!payload) return;
  updateClientSyncSnapshot({
    stateRevision: normalizeRevision(payload.stateRevision ?? payload.updatedAt),
    bootstrapRevision: normalizeRevision(payload.bootstrapRevision ?? payload.stateRevision ?? payload.updatedAt),
  });
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const { user: auth, status } = useAuthState();
  const authLoading = status === "loading";
  const storeHydrated = useAppStoreHydrated();
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
  const bootstrapRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRefreshInFlightRef = useRef(false);
  const resolvedBootstrap = bootstrap;
  const resolvedBootstrapRef = useRef<BootstrapPayload | null>(bootstrap);
  resolvedBootstrapRef.current = bootstrap;
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

  const applyRemoteHydration = useCallback((scopedUserId: string, remoteState: any | null, remoteUpdatedAt: number | null) => {
    const localDraft = readPreferredAppStateDraft(scopedUserId);
    hydrateState(
      pickHydrationState({
        localDraft,
        remoteState,
        remoteUpdatedAt,
      })
    );
  }, []);

  const refreshRemoteState = useCallback(async () => {
    if (!auth?.userId || stateRefreshInFlightRef.current) return;
    stateRefreshInFlightRef.current = true;
    const scopedUserId = auth.userId;
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/user/state", {
        method: "GET",
        headers: {
          "content-type": "application/json",
          ...authHeaders,
        },
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(String(json?.error ?? "failed_to_load_state"));
      }

      const nextStateRevision = normalizeRevision(json?.stateRevision ?? json?.updatedAt);
      const nextState = json?.state ?? null;
      const nextDegraded = Boolean(json?.degraded);
      const currentBootstrap = resolvedBootstrapRef.current;
      const nextRecoverySummary = json?.recoverySummary ?? currentBootstrap?.recoverySummary ?? null;
      const nextBootstrapRevision = Math.max(
        currentBootstrap?.bootstrapRevision ?? Number.NEGATIVE_INFINITY,
        nextStateRevision ?? Number.NEGATIVE_INFINITY
      );
      updateClientSyncSnapshot({
        stateRevision: nextStateRevision,
        bootstrapRevision: Number.isFinite(nextBootstrapRevision) ? nextBootstrapRevision : currentBootstrap?.bootstrapRevision ?? null,
      });

      const shouldAdoptState =
        (currentBootstrap?.degraded && !nextDegraded) ||
        (!currentBootstrap?.state && Boolean(nextState)) ||
        (nextStateRevision != null &&
          (normalizeRevision(currentBootstrap?.stateRevision ?? currentBootstrap?.updatedAt) == null ||
            nextStateRevision > (normalizeRevision(currentBootstrap?.stateRevision ?? currentBootstrap?.updatedAt) ?? -1)));

      if (!shouldAdoptState || !currentBootstrap) {
        if (!currentBootstrap && nextState) {
          applyRemoteHydration(scopedUserId, nextState, nextStateRevision);
        }
        return;
      }

      const nextBootstrap = normalizeBootstrapPayload({
        ...currentBootstrap,
        hasStoredState: currentBootstrap.hasStoredState || Boolean(nextState),
        state: nextState ?? currentBootstrap.state,
        stateRevision: nextStateRevision,
        bootstrapRevision: Number.isFinite(nextBootstrapRevision) ? nextBootstrapRevision : currentBootstrap.bootstrapRevision,
        updatedAt: nextStateRevision,
        recoverySummary: nextRecoverySummary,
        degraded: currentBootstrap.degraded && nextDegraded,
      });
      setBootstrap(nextBootstrap);
      setCurrentAccountBootstrap(scopedUserId, nextBootstrap);
      if (nextState) {
        applyRemoteHydration(scopedUserId, nextState, nextStateRevision);
      } else if (currentBootstrap?.consentCompleted) {
        applyRemoteHydration(scopedUserId, emptyState(), nextStateRevision);
      }
    } catch (error) {
      console.warn("[AppShell] failed_to_refresh_remote_state", {
        userId: scopedUserId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      stateRefreshInFlightRef.current = false;
    }
  }, [applyRemoteHydration, auth?.userId, getAuthHeaders]);

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

      const data = json?.data ? normalizeBootstrapPayload(json.data as BootstrapPayload) : null;
      if (!data || requestId !== bootstrapRequestRef.current) return null;
      syncClientRevisionsFromBootstrap(data);
      const shouldAdopt = shouldAdoptBootstrap(resolvedBootstrapRef.current, data);
      if (shouldAdopt) {
        setBootstrap(data);
        setCurrentAccountBootstrap(scopedUserId, data);
        applyRemoteHydration(scopedUserId, data.state ?? emptyState(), data.stateRevision ?? data.updatedAt);
      }
      setBootstrapSettledUserId(scopedUserId);
      setBootstrapError(null);
      return data;
    } catch (error) {
      if (requestId === bootstrapRequestRef.current) {
        setBootstrapSettledUserId(scopedUserId);
        setBootstrap(null);
        setCurrentAccountBootstrap(scopedUserId, null);
        setBootstrapError((error as Error)?.message ?? "failed_to_load_bootstrap");
        if (!silent) {
          console.error("[AppShell] failed_to_load_bootstrap", {
            userId: scopedUserId,
            error: (error as Error)?.message ?? "failed_to_load_bootstrap",
          });
        }
      }
      return null;
    } finally {
      if (requestId === bootstrapRequestRef.current) {
        setBootstrapLoading(false);
      }
    }
  }, [applyRemoteHydration, auth?.userId, getAuthHeaders]);

  useEffect(() => {
    if (bootstrapRetryTimerRef.current) {
      clearTimeout(bootstrapRetryTimerRef.current);
      bootstrapRetryTimerRef.current = null;
    }
    if (status === "loading") return;
    if (!auth?.userId) {
      bootstrapRequestRef.current += 1;
      resetClientSyncSnapshot();
      resetCurrentAccountResources(null);
      hydrateEmptyAppState();
      setBootstrap(null);
      setBootstrapLoading(false);
      setBootstrapError(null);
      setBootstrapSettledUserId(null);
      setBusyStage(null);
      return;
    }
    beginCurrentAccountSession(auth.userId);
    resetAppStoreForHydration();
    resetClientSyncSnapshot();
    setBootstrapSettledUserId(null);
    setBootstrap(null);
    setBootstrapError(null);
    const scopedUserId = auth.userId;
    void loadBootstrap().then((result) => {
      if (result?.degraded && scopedUserId === auth?.userId) {
        bootstrapRetryTimerRef.current = setTimeout(() => {
          void loadBootstrap({ silent: true });
        }, 5000);
      }
    });
    return () => {
      if (bootstrapRetryTimerRef.current) {
        clearTimeout(bootstrapRetryTimerRef.current);
        bootstrapRetryTimerRef.current = null;
      }
    };
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

  const canRenderAuthedContent = Boolean(resolvedBootstrap?.consentCompleted) && storeHydrated;
  const canRenderContent = isPolicyPage || (!authLoading && (!isAuthed || canRenderAuthedContent));
  const showBottomNav = !authLoading && !isNotebookImmersive && (!isAuthed || canRenderAuthedContent);
  const accountBoundaryKey = auth?.userId ?? "guest";

  const pageRef = useRef<HTMLDivElement>(null);
  const prevPathnameRef = useRef(pathname);

  useLayoutEffect(() => {
    if (pathname !== prevPathnameRef.current) {
      prevPathnameRef.current = pathname;
      const el = pageRef.current;
      if (el) {
        el.classList.remove("rnest-page-enter");
        void el.offsetWidth;
        el.classList.add("rnest-page-enter");
      }
    }
  }, [pathname]);

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
        console.error("[AppShell] onboarding_complete_post_failed", {
          status: res.status,
          error: json?.error ?? null,
        });
      }
    } catch (error) {
      console.error("[AppShell] onboarding_complete_error", {
        message: (error as Error)?.message ?? String(error),
      });
    }
    // Always try to reload bootstrap and proceed regardless of POST result.
    // If the POST failed, we mark onboarding as complete locally so the user
    // can proceed to consent. The server will retry ensureUserRow on next boot.
    try {
      const result = await loadBootstrap();
      if (result && !result.onboardingCompleted) {
        // POST failed and server still reports onboarding not done:
        // proceed anyway by marking it locally
        const patched = normalizeBootstrapPayload({ ...result, onboardingCompleted: true });
        setBootstrap(patched);
        setCurrentAccountBootstrap(auth.userId, patched);
        syncClientRevisionsFromBootstrap(patched);
      }
    } catch {
      // Even loadBootstrap failed: create a minimal local state to unblock consent
      const fallback = normalizeBootstrapPayload({
        onboardingCompleted: true,
        consentCompleted: false,
        hasStoredState: false,
        state: null,
        stateRevision: null,
        bootstrapRevision: null,
        updatedAt: null,
        recoverySummary: null,
      } as BootstrapPayload);
      setBootstrap(fallback);
      setCurrentAccountBootstrap(auth.userId, fallback);
      syncClientRevisionsFromBootstrap(fallback);
    }
    setBusyStage(null);
  }, [auth?.userId, busyStage, getAuthHeaders, loadBootstrap]);

  const handleConsentComplete = useCallback(
    async (input: { recordsStorage: true; aiUsage: true }) => {
      if (!auth?.userId || busyStage) return;
      setBusyStage("consent");
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
        const next = await loadBootstrap({ silent: true });
        if (!next?.consentCompleted) {
          const fallback = normalizeBootstrapPayload({
            onboardingCompleted: true,
            consentCompleted: true,
            hasStoredState: Boolean(next?.hasStoredState ?? resolvedBootstrap?.hasStoredState),
            state: next?.state ?? resolvedBootstrap?.state ?? null,
            stateRevision: normalizeRevision(next?.stateRevision ?? next?.updatedAt ?? resolvedBootstrap?.stateRevision ?? resolvedBootstrap?.updatedAt),
            bootstrapRevision: normalizeRevision(
              next?.bootstrapRevision ??
                next?.stateRevision ??
                next?.updatedAt ??
                resolvedBootstrap?.bootstrapRevision ??
                resolvedBootstrap?.stateRevision ??
                resolvedBootstrap?.updatedAt
            ),
            updatedAt: next?.updatedAt ?? resolvedBootstrap?.updatedAt ?? null,
            recoverySummary: next?.recoverySummary ?? resolvedBootstrap?.recoverySummary ?? null,
            degraded: true,
          } as BootstrapPayload);
          setBootstrap(fallback);
          setCurrentAccountBootstrap(auth.userId, fallback);
          syncClientRevisionsFromBootstrap(fallback);
        }
      } catch (error) {
        throw error;
      } finally {
        setBusyStage(null);
      }
    },
    [auth?.userId, busyStage, getAuthHeaders, loadBootstrap, resolvedBootstrap]
  );

  const loadingCopy = bootstrapLoading
    ? {
        message: "계정 동기화중입니다.",
        detail: "계정별 데이터를 불러오고 있습니다.",
      }
    : busyStage === "onboarding"
      ? {
          message: "온보딩을 마무리하는 중...",
          detail: "바로 동의 화면으로 이동합니다.",
        }
      : {
          message: "계정 동기화중입니다.",
          detail: "계정별 데이터를 불러오고 있습니다.",
        };

  return (
    <div className="min-h-dvh w-full bg-ios-bg">
      <UiPreferencesBridge />
      <div key={accountBoundaryKey}>
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
              <div ref={pageRef} className="rnest-page-enter">
                {children}
              </div>
            )
          ) : null}
        </div>
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
      {!isPolicyPage && (authLoading || (isAuthed && (!storeHydrated || busyStage === "onboarding" || (bootstrapLoading && !resolvedBootstrap?.consentCompleted)))) ? (
        <GateLoadingScreen
          message={
            authLoading
              ? "계정 동기화중입니다."
              : isAuthed && resolvedBootstrap?.consentCompleted && !storeHydrated
                ? "계정 동기화중입니다."
                : loadingCopy.message
          }
          detail={
            authLoading
              ? "계정별 데이터를 불러오고 있습니다."
              : isAuthed && resolvedBootstrap?.consentCompleted && !storeHydrated
                ? "계정별 데이터를 불러오고 있습니다."
                : loadingCopy.detail
          }
        />
      ) : null}
      {isAuthed && !isPolicyPage && !bootstrapLoading && bootstrapError && !resolvedBootstrap?.consentCompleted ? (
        <GateErrorScreen onRetry={() => {
          setBootstrapError(null);
          void loadBootstrap();
        }} />
      ) : null}
      <div key={`${accountBoundaryKey}:system`}>
        {!isPolicyPage ? (
          <CloudStateSync
            remoteEnabled={
              isAuthed &&
              bootstrapSettledUserId === (auth?.userId ?? null) &&
              Boolean(resolvedBootstrap?.consentCompleted)
            }
          />
        ) : null}
        {!isPolicyPage ? (
          <CloudNotebookSync
            remoteEnabled={
              isAuthed &&
              bootstrapSettledUserId === (auth?.userId ?? null) &&
              Boolean(resolvedBootstrap?.consentCompleted)
            }
          />
        ) : null}
        {!isPolicyPage ? (
          <UserStateSyncBridge
            enabled={
              isAuthed &&
              bootstrapSettledUserId === (auth?.userId ?? null) &&
              Boolean(resolvedBootstrap?.consentCompleted)
            }
            userId={auth?.userId ?? null}
            onRefreshState={refreshRemoteState}
            onRefreshBootstrap={() => loadBootstrap({ silent: true }).then(() => undefined)}
          />
        ) : null}
      </div>
      <OnboardingGuide open={showOnboarding} onComplete={handleOnboardingComplete} />
      {showConsent ? <ServiceConsentScreen onSubmit={handleConsentComplete} /> : null}
      <div className="safe-bottom" />
      {showBottomNav ? <BottomNav key={`${accountBoundaryKey}:bottom-nav`} /> : null}
    </div>
  );
}

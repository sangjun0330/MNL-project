"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { Session } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export type AuthUser = {
  userId: string;
  email?: string | null;
  provider?: string;
};

type AuthState = {
  session: Session | null;
  user: AuthUser | null;
  status: "loading" | "authenticated" | "unauthenticated";
  supabase: ReturnType<typeof createBrowserClient<Database>>;
};

const AuthContext = createContext<AuthState | null>(null);

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

function isRecoverableBrowserAuthError(error: unknown) {
  const message = String((error as Error)?.message ?? error ?? "").toLowerCase();
  return (
    message.includes("invalid refresh token") ||
    message.includes("refresh token not found") ||
    message.includes("jwt") ||
    message.includes("session missing")
  );
}

export function getSupabaseBrowserClient(): ReturnType<typeof createBrowserClient<Database>> {
  if (browserClient) return browserClient;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) {
    if (typeof window === "undefined") {
      return {} as ReturnType<typeof createBrowserClient<Database>>;
    }
    throw new Error(
      "Supabase env missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  browserClient = createBrowserClient<Database>(supabaseUrl, supabaseAnon);
  return browserClient;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    type ServerSessionStatus = { available: boolean; userId: string | null };

    const sessionUserToAuthUser = (nextSession: Session): AuthUser => ({
      userId: nextSession.user.id,
      email: nextSession.user.email ?? null,
      provider: (nextSession.user as { app_metadata?: { provider?: string } })?.app_metadata?.provider,
    });

    const dispatchAuthEvent = (event: string, userId: string | null) => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("rnest:auth-event", { detail: { event, userId } })
        );
      }
    };

    const readServerSession = async (): Promise<ServerSessionStatus> => {
      try {
        const response = await fetch("/api/auth/session", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (response.ok) {
          const payload = await response.json().catch(() => null);
          const userId = typeof payload?.userId === "string" ? payload.userId : null;
          return { available: true, userId };
        }
        if (response.status === 401) {
          return { available: true, userId: null };
        }
      } catch {
        // 네트워크 오류 → available: false로 처리 (서버 검증 불가 = 로그아웃 금지)
      }
      return { available: false, userId: null };
    };

    const clearClientAuth = async (options?: { localOnly?: boolean }) => {
      if (!options?.localOnly) {
        try {
          await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "include",
            cache: "no-store",
          });
        } catch {
          // ignore
        }
      }
      try {
        await supabase.auth.signOut({ scope: options?.localOnly ? "local" : "global" });
      } catch {
        // ignore
      }
      if (!active) return;
      setSession(null);
      setUser(null);
      setLoading(false);
    };

    const syncAllowedSession = async (nextSession: Session | null, prefetchedServerSession?: ServerSessionStatus) => {
      const serverSession = prefetchedServerSession ?? (await readServerSession());
      if (!active) return;

      if (!nextSession?.user) {
        if (serverSession.available && serverSession.userId) {
          // 서버에는 세션이 있는데 클라이언트가 없는 경우 → userId만 설정
          setSession(null);
          setUser({ userId: serverSession.userId });
          setLoading(false);
          return;
        }
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }

      if (serverSession.available) {
        if (serverSession.userId && serverSession.userId !== nextSession.user.id) {
          // 서버가 다른 userId를 명시적으로 반환한 경우만 로그아웃 (세션 혼용 방지)
          await clearClientAuth();
          return;
        }
        // serverSession.userId가 null인 경우: 서버가 현재 세션을 인식 못 함.
        // 이는 토큰 갱신 직후 타이밍 문제일 수 있으므로 클라이언트 세션을 신뢰한다.
        // (서버에서 signOut()을 더 이상 호출하지 않으므로 쿠키는 유효한 상태)
      }
      // available: false(네트워크 오류)인 경우도 클라이언트 세션을 신뢰

      if (!active) return;
      setSession(nextSession);
      setUser(sessionUserToAuthUser(nextSession));
      setLoading(false);
    };

    void (async () => {
      // ★ 클라이언트 세션을 먼저 가져온다.
      // Supabase SDK가 만료된 토큰을 자동 갱신한 뒤 반환하므로,
      // 이 단계 이후에 서버에 보내는 쿠키는 항상 최신 토큰이다.
      let clientSession: Session | null = null;
      try {
        const { data } = await supabase.auth.getSession();
        clientSession = data.session ?? null;
      } catch (error) {
        if (isRecoverableBrowserAuthError(error)) {
          await clearClientAuth({ localOnly: true });
          return;
        }
        if (!active) return;
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }

      if (!active) return;

      // 클라이언트 세션이 없을 때만 서버에 확인 → 있으면 서버 검증 없이 진행
      if (!clientSession?.user) {
        const serverSession = await readServerSession();
        if (!active) return;
        await syncAllowedSession(null, serverSession);
        return;
      }

      // 클라이언트 세션이 있는 경우: 서버와 교차 검증
      const serverSession = await readServerSession();
      if (!active) return;
      await syncAllowedSession(clientSession, serverSession);
    })();

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // ── TOKEN_REFRESHED ──────────────────────────────────────────────────────
      // Supabase가 refresh token으로 새 access token을 발급한 이벤트.
      // 이미 SDK가 쿠키를 갱신했고 토큰의 유효성을 보장하므로
      // 서버 재검증 없이 클라이언트 상태만 업데이트한다.
      // 이 이벤트에서 서버를 호출하면 갱신 직전 타이밍에 userId: null이 돌아와
      // 오로그아웃이 발생한다.
      if (event === "TOKEN_REFRESHED") {
        if (active) {
          if (nextSession?.user) {
            setSession(nextSession);
            setUser(sessionUserToAuthUser(nextSession));
          } else {
            setSession(null);
            setUser(null);
          }
          setLoading(false);
        }
        dispatchAuthEvent(event, nextSession?.user?.id ?? null);
        return;
      }

      // ── SIGNED_OUT ───────────────────────────────────────────────────────────
      // 사용자가 직접 로그아웃했거나 refresh token이 만료된 경우.
      // 즉시 로컬 상태를 초기화한다.
      if (event === "SIGNED_OUT") {
        if (active) {
          setSession(null);
          setUser(null);
          setLoading(false);
        }
        dispatchAuthEvent(event, null);
        return;
      }

      // ── 그 외 이벤트(SIGNED_IN, INITIAL_SESSION, USER_UPDATED 등) ────────────
      // 서버 교차 검증을 거쳐 허용된 사용자인지 확인한다.
      void syncAllowedSession(nextSession ?? null);
      dispatchAuthEvent(event, nextSession?.user?.id ?? null);
    });

    // ── visibilitychange 안전망 ──────────────────────────────────────────────
    // 앱이 백그라운드에서 포그라운드로 복귀할 때 React 상태가 비어 있으면
    // 조용히 클라이언트 세션을 재동기화한다.
    // (Supabase SDK가 TOKEN_REFRESHED를 이미 처리하지만, PWA/WebView에서
    //  이벤트가 누락되는 경우를 대비한 2차 안전망)
    const handleVisibilityChange = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible" || !active) return;
      supabase.auth
        .getSession()
        .then(({ data }) => {
          if (!active) return;
          if (data.session?.user) {
            setSession(data.session);
            setUser(sessionUserToAuthUser(data.session));
            setLoading(false);
          }
        })
        .catch(() => {
          // 무시 — 실패해도 현재 상태를 건드리지 않는다
        });
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      active = false;
      data.subscription?.unsubscribe();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [supabase]);

  const status: AuthState["status"] = loading
    ? "loading"
    : user
      ? "authenticated"
      : "unauthenticated";

  const value = useMemo(
    () => ({ session, user, status, supabase }),
    [session, user, status, supabase]
  );

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuthState(): { user: AuthUser | null; status: AuthState["status"] } {
  const ctx = useContext(AuthContext);
  if (!ctx) return { user: null, status: "loading" };
  return { user: ctx.user, status: ctx.status };
}

export function useAuth(): AuthUser | null {
  return useAuthState().user ?? null;
}

export async function getBrowserAuthHeaders(): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};
  try {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export function signInWithProvider(provider: "google" = "google") {
  const supabase = getSupabaseBrowserClient();
  const isBrowser = typeof window !== "undefined";
  const resolveOrigin = () => {
    if (isBrowser) {
      const browserOrigin = String(window.location.origin ?? "").trim();
      if (browserOrigin) return browserOrigin;
    }
    const raw = process.env.NEXT_PUBLIC_SITE_URL;
    if (raw) {
      try {
        const url = new URL(raw);
        return url.origin;
      } catch {
        // ignore invalid env
      }
    }
    return isBrowser ? window.location.origin : "";
  };
  const origin = resolveOrigin();
  const next = isBrowser
    ? `${window.location.pathname}${window.location.search}${window.location.hash}`
    : "/settings";
  const redirectTo = origin
    ? `${origin}/auth/callback?next=${encodeURIComponent(next)}`
    : undefined;
  return supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
    },
  });
}

export async function signOut() {
  const supabase = getSupabaseBrowserClient();
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    // ignore
  }
  return supabase.auth.signOut({ scope: "global" });
}

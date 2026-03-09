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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const clearClientAuth = async () => {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
        });
      } catch {
        // ignore
      }
      try {
        await supabase.auth.signOut({ scope: "global" });
      } catch {
        // ignore
      }
      if (!active) return;
      setSession(null);
      setLoading(false);
    };

    const syncAllowedSession = async (nextSession: Session | null) => {
      if (!active) return;
      if (!nextSession?.user) {
        setSession(null);
        setLoading(false);
        return;
      }
      try {
        const trustedUser = await supabase.auth.getUser();
        if (!active) return;
        if (trustedUser.error || !trustedUser.data.user?.id || trustedUser.data.user.id !== nextSession.user.id) {
          await clearClientAuth();
          return;
        }
        const response = await fetch("/api/auth/session", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (!active) return;
        if (response.ok) {
          setSession(nextSession);
          setLoading(false);
          return;
        }
        if (response.status === 401) {
          await clearClientAuth();
          return;
        }
      } catch {
        await clearClientAuth();
        return;
      }
      if (!active) return;
      await clearClientAuth();
    };

    supabase.auth.getSession().then(({ data }) => {
      void syncAllowedSession(data.session ?? null);
    });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      void syncAllowedSession(nextSession ?? null);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("rnest:auth-event", {
            detail: {
              event,
              userId: nextSession?.user?.id ?? null,
            },
          })
        );
      }
    });

    return () => {
      active = false;
      data.subscription?.unsubscribe();
    };
  }, [supabase]);

  const user: AuthUser | null = useMemo(() => {
    if (!session?.user) return null;
    return {
      userId: session.user.id,
      email: session.user.email ?? null,
      provider: (session.user as { app_metadata?: { provider?: string } })?.app_metadata?.provider,
    };
  }, [session]);

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

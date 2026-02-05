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

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) {
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

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      data.subscription?.unsubscribe();
    };
  }, [supabase]);

  const user: AuthUser | null = session?.user
    ? {
        userId: session.user.id,
        email: session.user.email ?? null,
        provider: (session.user as { app_metadata?: { provider?: string } })?.app_metadata?.provider,
      }
    : null;

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
  const origin = isBrowser ? window.location.origin : "";
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
    },
  });
}

export function signOut() {
  const supabase = getSupabaseBrowserClient();
  return supabase.auth.signOut();
}

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useSessionContext } from "@supabase/auth-helpers-react";

export type AuthUser = {
  userId: string;
  email?: string | null;
  provider?: string;
};

export function useAuthState(): { user: AuthUser | null; status: "loading" | "authenticated" | "unauthenticated" } {
  const { session, isLoading } = useSessionContext();
  const uid = session?.user?.id ?? "";
  const status = isLoading ? "loading" : uid ? "authenticated" : "unauthenticated";
  if (!uid) return { user: null, status };
  return {
    user: {
      userId: String(uid),
      email: session?.user?.email ?? null,
      provider: (session?.user as any)?.app_metadata?.provider ?? undefined,
    },
    status,
  };
}

export function useAuth(): AuthUser | null {
  const { user } = useAuthState();
  return user ?? null;
}

export function signInWithProvider(provider: "google" | "kakao") {
  const supabase = createClientComponentClient();
  return (async () => {
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;
    const options: { redirectTo?: string; skipBrowserRedirect?: boolean; scopes?: string } = {
      redirectTo,
      skipBrowserRedirect: true,
    };
    if (provider === "kakao") {
      // Force Kakao to request nickname only (avoid account_email/profile_image).
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        if (typeof window !== "undefined") {
          alert("Supabase URL이 설정되지 않았어요. NEXT_PUBLIC_SUPABASE_URL을 확인해 주세요.");
        }
        return { data: null, error: new Error("Missing NEXT_PUBLIC_SUPABASE_URL") };
      }
      if (typeof window !== "undefined") {
        const params = new URLSearchParams({ provider: "kakao", scope: "profile_nickname", prompt: "consent" });
        if (redirectTo) params.set("redirect_to", redirectTo);
        window.location.href = `${supabaseUrl}/auth/v1/authorize?${params.toString()}`;
      }
      return { data: { url: `${supabaseUrl}/auth/v1/authorize` }, error: null };
    }
    const { data, error } = await supabase.auth.signInWithOAuth({ provider, options });

    if (error) {
      if (typeof window !== "undefined") {
        alert("해당 소셜 로그인이 Supabase에서 활성화되지 않았어요. Supabase 콘솔에서 Provider를 켜주세요.");
      }
      return { data, error };
    }

    if (data?.url && typeof window !== "undefined") {
      window.location.href = data.url;
    }

    return { data, error };
  })();
}

export function signOut() {
  const supabase = createClientComponentClient();
  return supabase.auth.signOut();
}

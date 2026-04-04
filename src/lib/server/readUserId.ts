import { getRouteSupabaseClient } from "@/lib/server/supabaseRouteClient";
import { isAuthEmailAllowed } from "@/lib/server/authAccess";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export type ServerAuthIdentity = {
  userId: string;
  email: string | null;
};

let bearerSupabaseClient: ReturnType<typeof createClient<Database>> | null = null;

function extractBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (!scheme || !token) return null;
  return scheme.toLowerCase() === "bearer" ? token : null;
}

function getBearerSupabaseClient() {
  if (bearerSupabaseClient) return bearerSupabaseClient;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) {
    throw new Error("Supabase env missing (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  }
  bearerSupabaseClient = createClient<Database>(supabaseUrl, supabaseAnon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return bearerSupabaseClient;
}

export async function readUserIdFromRequest(req: Request): Promise<string> {
  const identity = await readAuthIdentityFromRequest(req);
  return identity.userId;
}

export async function readAuthIdentityFromRequest(req: Request): Promise<ServerAuthIdentity> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) return { userId: "", email: null };

  const bearer = extractBearerToken(req);

  if (bearer) {
    // Bearer 토큰이 명시적으로 제공된 경우: 해당 토큰으로만 인증.
    // 토큰이 무효하더라도 cookie 기반 인증으로 폴스루하지 않아
    // 토큰 위조나 세션 혼용 공격을 방지한다.
    try {
      const supabase = getBearerSupabaseClient();
      const { data, error } = await supabase.auth.getUser(bearer);
      if (!error && data.user?.id && isAuthEmailAllowed(data.user.email ?? null)) {
        return {
          userId: data.user.id,
          email: data.user.email ?? null,
        };
      }
    } catch (error) {
      console.error("[Auth] bearer auth lookup failed: %s", String((error as Error)?.message ?? error));
    }
    return { userId: "", email: null };
  }

  // Bearer 토큰이 없을 때만 cookie 기반 인증 시도
  try {
    const supabase = await getRouteSupabaseClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user?.id && isAuthEmailAllowed(data.user.email ?? null)) {
      return {
        userId: data.user.id,
        email: data.user.email ?? null,
      };
    }
  } catch (error) {
    console.error("[Auth] cookie auth lookup failed: %s", String((error as Error)?.message ?? error));
  }
  return { userId: "", email: null };
}

export async function readUserIdFromServer(): Promise<string> {
  const identity = await readAuthIdentityFromServer();
  return identity.userId;
}

export async function readAuthIdentityFromServer(): Promise<ServerAuthIdentity> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) return { userId: "", email: null };

  try {
    const supabase = await getRouteSupabaseClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user?.id && isAuthEmailAllowed(data.user.email ?? null)) {
      return {
        userId: data.user.id,
        email: data.user.email ?? null,
      };
    }
  } catch (error) {
    console.error("[Auth] server auth lookup failed: %s", String((error as Error)?.message ?? error));
  }
  return { userId: "", email: null };
}

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { ensureUserRow } from "@/lib/server/userStateStore";
import { hasAuthEmailAllowlist, isAuthEmailAllowed, shouldRequireExistingAuthUser } from "@/lib/server/authAccess";
import { getRouteSupabaseClient } from "@/lib/server/supabaseRouteClient";

export const runtime = "edge";
export const dynamic = "force-dynamic";
const DEFAULT_AUTH_REDIRECT_PATH = "/settings";

function resolveSafeNextPath(rawNext: string | null, origin: string) {
  const candidate = String(rawNext ?? "").trim() || DEFAULT_AUTH_REDIRECT_PATH;
  if (!candidate.startsWith("/")) return DEFAULT_AUTH_REDIRECT_PATH;
  if (candidate.startsWith("//")) return DEFAULT_AUTH_REDIRECT_PATH;
  if (candidate.includes("\\")) return DEFAULT_AUTH_REDIRECT_PATH;
  if (/[\u0000-\u001f]/.test(candidate)) return DEFAULT_AUTH_REDIRECT_PATH;
  try {
    const target = new URL(candidate, origin);
    if (target.origin !== origin) return DEFAULT_AUTH_REDIRECT_PATH;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return DEFAULT_AUTH_REDIRECT_PATH;
  }
}

async function hasExistingAppUser(userId: string) {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from("rnest_users").select("user_id").eq("user_id", userId).maybeSingle();
    if (error) {
      console.error("[AuthCallback] failed to check existing app user: %s", String(error.message ?? error));
      return false;
    }
    return Boolean(data?.user_id);
  } catch (error) {
    console.error("[AuthCallback] existing app user check crashed: %s", String((error as Error)?.message ?? error));
    return false;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const origin = url.origin;
  let authError = "";

  if (code) {
    const supabase = await getRouteSupabaseClient();

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      authError = "oauth_exchange_failed";
      console.error("[AuthCallback] exchangeCodeForSession failed: %s", String(error.message ?? error));
    } else {
      const email = data.user?.email ?? null;
      if (!isAuthEmailAllowed(email)) {
        authError = "unauthorized_email";
        console.warn("[AuthCallback] blocked sign-in for non-allowlisted email");
        await supabase.auth.signOut();
      }
      const userId = data.user?.id;
      if (userId && !authError && shouldRequireExistingAuthUser()) {
        const exists = await hasExistingAppUser(userId);
        if (!exists) {
          authError = "unauthorized_new_user";
          console.warn("[AuthCallback] blocked sign-in for user without existing app record");
          await supabase.auth.signOut();
        }
      }
      if (userId && !authError) {
        try {
          await ensureUserRow(userId);
        } catch {
          // ignore user bootstrap errors (do not block login)
        }
      } else if (!userId) {
        authError = "oauth_user_missing";
        console.error("[AuthCallback] no user returned after OAuth exchange");
      }
    }
  }

  const safeNext = resolveSafeNextPath(next, origin);
  const redirectUrl = new URL(safeNext, origin);
  if (authError) {
    redirectUrl.searchParams.set("authError", authError);
    if (authError === "unauthorized_email" && hasAuthEmailAllowlist()) {
      redirectUrl.searchParams.set("authHint", "allowlist");
    }
  }
  return NextResponse.redirect(redirectUrl);
}

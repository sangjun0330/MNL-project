import { NextResponse } from "next/server";

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

function maskEmail(email: string | null | undefined) {
  if (!email) return "(empty)";
  return email.replace(/(.{2}).*@/, "$1***@");
}

async function safeSignOut(supabase: { auth?: { signOut?: () => Promise<unknown> } } | null, context: string) {
  if (!supabase?.auth?.signOut) return;
  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.error("[AuthCallback] signOut failed (%s): %s", context, String((error as Error)?.message ?? error));
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const origin = url.origin;
  let authError = "";
  let allowlistEnabled = false;

  try {
    const [
      { getRouteSupabaseClient },
      { getSupabaseAdmin },
      { ensureUserRow },
      { hasAuthEmailAllowlist, isAuthEmailAllowed, shouldRequireExistingAuthUser },
    ] = await Promise.all([
      import("@/lib/server/supabaseRouteClient"),
      import("@/lib/server/supabaseAdmin"),
      import("@/lib/server/userRowStore"),
      import("@/lib/server/authAccess"),
    ]);

    allowlistEnabled = hasAuthEmailAllowlist();

    const hasExistingAppUser = async (userId: string) => {
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
    };

    if (code) {
      let supabase: Awaited<ReturnType<typeof getRouteSupabaseClient>> | null = null;

      try {
        supabase = await getRouteSupabaseClient();
      } catch (clientErr) {
        authError = "oauth_exchange_failed";
        console.error("[AuthCallback] getRouteSupabaseClient failed: %s", String((clientErr as Error)?.message ?? clientErr));
      }

      if (supabase && !authError) {
        let exchange: { data: { user?: { id?: string | null; email?: string | null } | null }; error: { message?: string } | null } | null = null;

        try {
          const result = await supabase.auth.exchangeCodeForSession(code);
          exchange = {
            data: {
              user: {
                id: result.data.user?.id ?? null,
                email: result.data.user?.email ?? null,
              },
            },
            error: result.error ? { message: result.error.message } : null,
          };
        } catch (exchangeErr) {
          authError = "oauth_exchange_failed";
          console.error("[AuthCallback] exchangeCodeForSession threw: %s", String((exchangeErr as Error)?.message ?? exchangeErr));
        }

        if (exchange && !authError) {
          const { data, error } = exchange;
          if (error) {
            authError = "oauth_exchange_failed";
            console.error("[AuthCallback] exchangeCodeForSession failed: %s", String(error.message ?? error));
          } else {
            const email = data.user?.email ?? null;
            const userId = data.user?.id ?? null;

            if (!isAuthEmailAllowed(email)) {
              authError = "unauthorized_email";
              console.warn("[AuthCallback] blocked sign-in for non-allowlisted email: %s", maskEmail(email));
              await safeSignOut(supabase, "unauthorized_email");
            }

            if (userId && !authError && shouldRequireExistingAuthUser()) {
              const exists = await hasExistingAppUser(userId);
              if (!exists) {
                authError = "unauthorized_new_user";
                console.warn("[AuthCallback] blocked new user without existing app record: %s", maskEmail(email));
                await safeSignOut(supabase, "unauthorized_new_user");
              }
            }

            if (userId && !authError) {
              try {
                await ensureUserRow(userId);
              } catch (ensureErr) {
                console.error("[AuthCallback] ensureUserRow failed: %s", String((ensureErr as Error)?.message ?? ensureErr));
              }
            } else if (!userId) {
              authError = "oauth_user_missing";
              console.error("[AuthCallback] no user returned after OAuth exchange");
            }
          }
        }
      }
    }
  } catch (outerErr) {
    if (!authError) authError = "oauth_exchange_failed";
    console.error("[AuthCallback] unexpected_error: %s", String((outerErr as Error)?.message ?? outerErr));
  }

  const safeNext = resolveSafeNextPath(next, origin);
  const redirectUrl = new URL(safeNext, origin);
  if (authError) {
    redirectUrl.searchParams.set("authError", authError);
    if (authError === "unauthorized_email" && allowlistEnabled) {
      redirectUrl.searchParams.set("authHint", "allowlist");
    }
  }
  return NextResponse.redirect(redirectUrl);
}

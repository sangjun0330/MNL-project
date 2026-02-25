import { NextResponse } from "next/server";
import { ensureUserRow } from "@/lib/server/userStateStore";
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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const origin = url.origin;

  if (code) {
    const supabase = await getRouteSupabaseClient();

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const userId = data.user?.id;
      if (userId) {
        try {
          await ensureUserRow(userId);
        } catch {
          // ignore user bootstrap errors (do not block login)
        }
      }
    }
  }

  const safeNext = resolveSafeNextPath(next, origin);
  return NextResponse.redirect(new URL(safeNext, origin));
}

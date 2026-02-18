import { NextResponse } from "next/server";
import { ensureUserRow } from "@/lib/server/userStateStore";
import { getRouteSupabaseClient } from "@/lib/server/supabaseRouteClient";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/settings";
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

  const safeNext = next.startsWith("/") ? next : "/settings";
  return NextResponse.redirect(new URL(safeNext, origin));
}

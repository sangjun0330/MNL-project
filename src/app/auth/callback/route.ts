import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { emptyState } from "@/lib/model";
import { loadUserState, saveUserState } from "@/lib/server/userStateStore";

export const runtime = "edge";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const supabase = createRouteHandlerClient({ cookies });
    await supabase.auth.exchangeCodeForSession(code);
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id ?? "";
    if (userId) {
      try {
        const existing = await loadUserState(userId);
        if (!existing?.payload) {
          await saveUserState({ userId, payload: emptyState() });
        }
      } catch (err) {
        console.error("Failed to init user state after login", err);
      }
    }
  }

  return NextResponse.redirect(new URL("/settings", requestUrl.origin));
}

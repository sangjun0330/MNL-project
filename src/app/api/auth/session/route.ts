import { NextResponse } from "next/server";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getRouteSupabaseClient } from "@/lib/server/supabaseRouteClient";
import { jsonNoStore } from "@/lib/server/requestSecurity";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) {
    try {
      const supabase = await getRouteSupabaseClient();
      await supabase.auth.signOut();
    } catch {
      // Best-effort cookie clearing.
    }
    return jsonNoStore({ ok: true, authenticated: false, userId: null });
  }
  return jsonNoStore({ ok: true, authenticated: true, userId });
}

import { getRouteSupabaseClient } from "@/lib/server/supabaseRouteClient";
import { jsonNoStore } from "@/lib/server/requestSecurity";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = await getRouteSupabaseClient();
    await supabase.auth.signOut();
  } catch {
    // Best-effort cookie clearing.
  }
  return jsonNoStore({ ok: true });
}

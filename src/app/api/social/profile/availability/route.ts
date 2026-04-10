import { jsonNoStore } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { checkSocialProfileAvailability } from "@/lib/server/socialHub";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const url = new URL(req.url);
  const field = url.searchParams.get("field");
  const value = url.searchParams.get("value") ?? "";
  const admin = getSupabaseAdmin();

  try {
    const result = await checkSocialProfileAvailability(admin, userId, { field, value });
    return jsonNoStore({ ok: true, data: result });
  } catch (err: any) {
    if (err?.code === "invalid_field") {
      return jsonNoStore({ ok: false, error: "invalid_field" }, { status: 400 });
    }
    console.error("[SocialProfileAvailability/GET] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_check_availability" }, { status: 500 });
  }
}

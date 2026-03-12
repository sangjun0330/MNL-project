import { jsonNoStore } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { loadUserBootstrap } from "@/lib/server/serviceConsentStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) {
    return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });
  }

  try {
    const data = await loadUserBootstrap(userId);
    return jsonNoStore({ ok: true, data });
  } catch {
    return jsonNoStore({ ok: false, error: "failed_to_load_bootstrap" }, { status: 500 });
  }
}

import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { markUserOnboardingCompleted } from "@/lib/server/serviceConsentStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sameOriginError = sameOriginRequestError(req);
  if (sameOriginError) {
    return jsonNoStore({ ok: false, error: sameOriginError }, { status: 403 });
  }

  const userId = await readUserIdFromRequest(req);
  if (!userId) {
    return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });
  }

  try {
    await markUserOnboardingCompleted(userId);
    return jsonNoStore({ ok: true });
  } catch {
    return jsonNoStore({ ok: false, error: "failed_to_complete_onboarding" }, { status: 500 });
  }
}

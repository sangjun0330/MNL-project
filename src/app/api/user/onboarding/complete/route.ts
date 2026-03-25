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
  } catch (err) {
    console.error("[OnboardingComplete] failed_to_complete_onboarding", {
      userId: String(userId).slice(0, 8),
      code: (err as any)?.code,
      message: String((err as any)?.message ?? err).slice(0, 200),
    });
    return jsonNoStore({ ok: false, error: "failed_to_complete_onboarding" }, { status: 500 });
  }
}
